"""
Doc-to-LoRA bridge script for muse-novel.
Progress JSON lines to stdout:
  {"stage": "loading|internalize|saving|done|error", "progress": 0-100, "message": "..."}
  {"stage": "done", ..., "output": "<path>"}
"""

import argparse
import gc
import json
import os
import sys
import time

# flash_attn .so 빌드가 깨진 환경에서도 동작하도록 eager attention 강제 설정
os.environ.setdefault("TRANSFORMERS_ATTN_IMPLEMENTATION", "eager")
# 멀티 GPU 환경에서 메모리 단편화 방지
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


def emit(stage: str, progress: int, message: str, **extra) -> None:
    print(
        json.dumps(
            {"stage": stage, "progress": progress, "message": message, **extra},
            ensure_ascii=False,
        ),
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    if not os.path.exists(args.checkpoint):
        emit("error", 0, f"체크포인트 없음: {args.checkpoint}")
        sys.exit(1)
    if not os.path.exists(args.input):
        emit("error", 0, f"입력 파일 없음: {args.input}")
        sys.exit(1)
    os.makedirs(args.output, exist_ok=True)

    emit("loading", 5, "라이브러리 로딩 중...")
    try:
        import torch
        from safetensors.torch import save_file
    except ImportError as e:
        emit("error", 0, f"패키지 없음: {e}")
        sys.exit(1)

    emit("loading", 15, "Doc-to-LoRA 모듈 로딩 중...")
    try:
        import ctx_to_lora.model_loading as _model_loading_mod
        from ctx_to_lora.model_loading import get_tokenizer
        from ctx_to_lora.modeling.hypernet import ModulatedPretrainedModel

        # flash_attn .so 빌드 불량 환경: get_model이 flash_attention_2를 요청하지 않도록 monkey-patch
        _orig_get_model = _model_loading_mod.get_model

        def _get_model_no_flash(*args, **kwargs):
            kwargs["use_flash_attn"] = False
            model = _orig_get_model(*args, **kwargs)
            if hasattr(model, "config"):
                model.config._attn_implementation = "eager"
                model.config._attn_implementation_internal = "eager"
            return model

        _model_loading_mod.get_model = _get_model_no_flash
    except ImportError as e:
        emit(
            "error",
            0,
            (
                f"ctx_to_lora 패키지 없음: {e}  |  "
                "해결: git clone https://github.com/SakanaAI/doc-to-lora 후 "
                ".env.local 에 DOC_TO_LORA_PATH=/path/to/doc-to-lora 추가"
            ),
        )
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    # 멀티 GPU 환경에서 두 GPU에 자동 분산하여 메모리 부족 방지
    device_map = (
        "auto"
        if torch.cuda.is_available() and torch.cuda.device_count() > 1
        else device
    )
    emit(
        "loading",
        25,
        f"하이퍼네트워크 체크포인트 로딩 중... (device_map: {device_map})",
    )
    t0 = time.time()
    try:
        state_dict = torch.load(args.checkpoint, weights_only=False, map_location="cpu")
        # flash_attn .so 빌드 불량 환경을 위해: state_dict 내 base_model config의
        # _attn_implementation을 eager로 강제 패치한 뒤 로딩
        for key in ("base_model_config", "config"):
            cfg = state_dict.get(key)
            if cfg is not None and hasattr(cfg, "_attn_implementation"):
                cfg._attn_implementation = "eager"
                cfg._attn_implementation_internal = "eager"
        model = ModulatedPretrainedModel.from_state_dict(
            state_dict,
            train=False,
            use_sequence_packing=False,
            use_flash_attn=False,
            base_model_kwargs={"device_map": device_map},
        )
        del state_dict
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        # ctx_encoder 로딩 후에도 강제 패치
        if hasattr(model, "base_model") and hasattr(model.base_model, "config"):
            model.base_model.config._attn_implementation = "eager"
            model.base_model.config._attn_implementation_internal = "eager"
        model.reset()
        get_tokenizer(model.base_model.name_or_path)
    except Exception as e:
        emit("error", 0, f"체크포인트 로드 실패: {e}")
        sys.exit(1)

    emit("loading", 45, f"체크포인트 로드 완료 ({time.time() - t0:.1f}s)")

    emit("internalize", 50, "소설 텍스트 읽는 중...")
    with open(args.input, "r", encoding="utf-8") as f:
        doc_text = f.read()
    emit("internalize", 55, f"텍스트 로드 ({len(doc_text):,} 글자). LoRA 생성 중...")

    t1 = time.time()
    try:
        model.internalize(doc_text)
    except Exception as e:
        import traceback

        emit("error", 0, f"internalize 실패: {e}")
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    emit("internalize", 80, f"LoRA 생성 완료 ({time.time() - t1:.2f}s)")

    emit("saving", 85, "저장 중...")
    try:
        generated_loras = model.generated_loras
        if not generated_loras:
            emit("error", 0, "generated_loras 비어있음")
            sys.exit(1)

        flat: dict = {}
        for mod, ab in generated_loras.items():
            flat[f"{mod}.lora_A.weight"] = ab["A"].squeeze(0).contiguous().float()
            flat[f"{mod}.lora_B.weight"] = ab["B"].squeeze(0).contiguous().float()

        output_file = os.path.join(args.output, "adapter_model.safetensors")
        save_file(flat, output_file)

        sample_a = next(iter(flat.values()))
        lora_rank = sample_a.shape[0]
        adapter_config = {
            "base_model_name_or_path": model.base_model.name_or_path,
            "bias": "none",
            "fan_in_fan_out": False,
            "inference_mode": True,
            "init_lora_weights": True,
            "lora_alpha": lora_rank,
            "lora_dropout": 0.0,
            "modules_to_save": None,
            "peft_type": "LORA",
            "r": lora_rank,
            "target_modules": list({k.rsplit(".lora_", 1)[0] for k in flat}),
            "task_type": "CAUSAL_LM",
        }
        config_path = os.path.join(args.output, "adapter_config.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(adapter_config, f, indent=2, ensure_ascii=False)
    except Exception as e:
        emit("error", 0, f"저장 실패: {e}")
        sys.exit(1)

    emit("done", 100, "LoRA 생성 완료!", output=output_file)


if __name__ == "__main__":
    main()
