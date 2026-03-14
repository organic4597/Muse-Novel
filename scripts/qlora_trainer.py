"""
QLoRA fine-tuning script for muse-novel.
Trains a LoRA adapter on novel text to capture writing style.

Progress JSON lines to stdout (stable SSE progress protocol):
  {"stage": "loading|tokenizing|training|saving|done|error", "progress": 0-100, "message": "..."}
  {"stage": "done", ..., "output": "<path>"}

Usage:
  python scripts/qlora_trainer.py \
    --input /tmp/novel.txt [--input /tmp/novel2.txt ...] \
    --output loras/{projectId} \
    [--model Qwen/Qwen3.5-9B-Base] \
    [--epochs 1] \
    [--seq-length 512] \
    [--batch-size 1] \
    [--grad-accum 16] \
    [--lora-r 16] \
    [--lora-alpha 32] \
    [--learning-rate 2e-4]
"""

import argparse
import gc
import json
import os
import re
import sys
import time
from typing import Any

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

_stdout_broken = False


def _disable_broken_stdout() -> None:
    global _stdout_broken
    if _stdout_broken:
        return
    _stdout_broken = True
    try:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    except Exception:
        pass


def emit(stage: str, progress: int, message: str, **extra) -> None:
    payload = json.dumps(
        {"stage": stage, "progress": progress, "message": message, **extra},
        ensure_ascii=False,
    )
    try:
        print(payload, flush=True)
    except BrokenPipeError:
        _disable_broken_stdout()
    except OSError as exc:
        if exc.errno == 32:
            _disable_broken_stdout()
            return
        raise


class ProgressCallback:
    """TRL callback that emits JSON progress lines."""

    def __init__(self, total_steps: int) -> None:
        self.total_steps = max(total_steps, 1)
        self.last_pct = 0

    def on_log(self, args, state, control, logs=None, **kwargs):
        if state.global_step <= 0:
            return
        # Map training steps to 40-90% range
        raw_pct = state.global_step / self.total_steps
        pct = int(40 + raw_pct * 50)
        pct = min(pct, 90)
        if pct > self.last_pct:
            self.last_pct = pct
            loss_str = ""
            if logs and "loss" in logs:
                loss_str = f" loss={logs['loss']:.4f}"
            emit(
                "training",
                pct,
                f"학습 중... step {state.global_step}/{self.total_steps}{loss_str}",
            )

    def on_step_end(self, args, state, control, **kwargs):
        raw_pct = state.global_step / self.total_steps
        pct = int(40 + raw_pct * 50)
        pct = min(pct, 90)
        if pct > self.last_pct + 4:
            self.last_pct = pct
            emit("training", pct, f"학습 중... step {state.global_step}/{self.total_steps}")


def parse_bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_max_memory_overrides(raw: str | None) -> dict[int | str, str]:
    if not raw:
        return {}

    overrides: dict[int | str, str] = {}
    for item in raw.split(","):
        chunk = item.strip()
        if not chunk:
            continue
        if "=" not in chunk:
            raise ValueError(f"잘못된 QLORA_MAX_MEMORY 형식: {chunk}")
        key, value = chunk.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not value:
            raise ValueError(f"빈 메모리 값: {chunk}")
        if key.lower() == "cpu":
            overrides["cpu"] = value
        else:
            overrides[int(key)] = value
    return overrides


def build_max_memory(torch_module) -> dict[int | str, str]:
    max_memory: dict[int | str, str] = {"cpu": os.environ.get("QLORA_CPU_MAX_MEMORY", "64GiB")}
    reserve_mib_override = os.environ.get("QLORA_GPU_RESERVE_MIB")
    reserve_mib_value = int(reserve_mib_override) if reserve_mib_override else None

    for gpu_index in range(torch_module.cuda.device_count()):
        total_bytes = torch_module.cuda.get_device_properties(gpu_index).total_memory
        total_mib = total_bytes // (1024 * 1024)
        reserve_mib = (
            reserve_mib_value
            if reserve_mib_value is not None
            else min(2048, max(1024, total_mib // 8))
        )
        usable_mib = max(4096, total_mib - reserve_mib)
        max_memory[gpu_index] = f"{usable_mib}MiB"

    overrides = parse_max_memory_overrides(os.environ.get("QLORA_MAX_MEMORY"))
    max_memory.update(overrides)
    return max_memory


def find_latest_checkpoint(checkpoint_root: str) -> str | None:
    if not os.path.isdir(checkpoint_root):
        return None

    latest_step = -1
    latest_path: str | None = None
    pattern = re.compile(r"^checkpoint-(\d+)$")

    for entry in os.listdir(checkpoint_root):
        match = pattern.match(entry)
        if not match:
            continue
        full_path = os.path.join(checkpoint_root, entry)
        if not os.path.isdir(full_path):
            continue
        step = int(match.group(1))
        if step > latest_step:
            latest_step = step
            latest_path = full_path

    return latest_path


def main() -> None:
    parser = argparse.ArgumentParser(description="QLoRA fine-tuning for novel style")
    parser.add_argument("--input", required=True, nargs="+", help="Input text file(s)")
    parser.add_argument("--output", required=True, help="Output directory for adapter")
    parser.add_argument("--model", default="Qwen/Qwen3.5-9B-Base", help="Base model ID")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--seq-length", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=16)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--save-steps", type=int, default=25)
    parser.add_argument("--save-total-limit", type=int, default=2)
    args = parser.parse_args()

    # Validate inputs
    for inp in args.input:
        if not os.path.exists(inp):
            emit("error", 0, f"입력 파일 없음: {inp}")
            sys.exit(1)
    os.makedirs(args.output, exist_ok=True)

    # ── Load text ──────────────────────────────────────────────────────────
    emit("loading", 5, "텍스트 파일 읽는 중...")
    all_text = []
    for inp in args.input:
        with open(inp, "r", encoding="utf-8") as f:
            text = f.read().strip()
            if text:
                all_text.append(text)
    combined_text = "\n\n".join(all_text)
    if not combined_text:
        emit("error", 0, "입력 텍스트가 비어있습니다")
        sys.exit(1)
    emit("loading", 8, f"텍스트 로드 완료: {len(combined_text):,}자 ({len(args.input)}개 파일)")

    # ── Import heavy deps ──────────────────────────────────────────────────
    emit("loading", 10, "라이브러리 로딩 중...")
    try:
        import torch
        from transformers import (
            AutoConfig,
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
            TrainerCallback,
        )
        from peft import LoraConfig, get_peft_model
        from trl import SFTConfig, SFTTrainer
        from datasets import Dataset
    except ImportError as e:
        emit("error", 0, f"패키지 없음: {e}")
        sys.exit(1)

    if not torch.cuda.is_available():
        emit("error", 0, "CUDA를 사용할 수 없습니다. GPU가 필요합니다.")
        sys.exit(1)

    gpu_count = torch.cuda.device_count()
    gpu_names = [torch.cuda.get_device_name(i) for i in range(gpu_count)]
    emit("loading", 12, f"GPU {gpu_count}개 감지: {', '.join(gpu_names)}")

    # ── Wrap ProgressCallback as TrainerCallback ───────────────────────────
    class _ProgressCB(TrainerCallback):
        def __init__(self, total_steps: int):
            self._inner = ProgressCallback(total_steps)

        def on_log(self, targs, state, control, logs=None, **kw):
            self._inner.on_log(targs, state, control, logs, **kw)

        def on_step_end(self, targs, state, control, **kw):
            self._inner.on_step_end(targs, state, control, **kw)

    # ── Load tokenizer ─────────────────────────────────────────────────────
    emit("loading", 15, f"토크나이저 로딩: {args.model}...")
    hf_token = os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")
    tokenizer = AutoTokenizer.from_pretrained(
        args.model,
        trust_remote_code=True,
        token=hf_token,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # ── Tokenize into chunks ───────────────────────────────────────────────
    emit("tokenizing", 18, "텍스트 토크나이징 중...")
    encoded = tokenizer.encode(combined_text, add_special_tokens=False)
    total_tokens = len(encoded)
    emit("tokenizing", 20, f"총 {total_tokens:,} 토큰")

    seq_len = args.seq_length
    chunks = []
    for i in range(0, len(encoded) - seq_len + 1, seq_len):
        chunk = encoded[i : i + seq_len]
        chunks.append(tokenizer.decode(chunk, skip_special_tokens=False))

    # Also add the last partial chunk if it's reasonably sized (>= 64 tokens)
    remainder = len(encoded) % seq_len
    if remainder >= 64:
        last_chunk = encoded[-(remainder):]
        chunks.append(tokenizer.decode(last_chunk, skip_special_tokens=False))

    if not chunks:
        emit("error", 0, f"텍스트가 너무 짧습니다 (최소 {seq_len} 토큰 필요, 현재 {total_tokens} 토큰)")
        sys.exit(1)

    emit("tokenizing", 25, f"{len(chunks)}개 청크 생성 ({seq_len} 토큰/청크)")
    dataset = Dataset.from_dict({"text": chunks})

    # ── Load model with 4-bit quantization ─────────────────────────────────
    emit("loading", 28, f"모델 로딩: {args.model} (4-bit QLoRA)...")
    t0 = time.time()

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    max_memory = build_max_memory(torch)
    enable_cpu_offload = parse_bool_env("QLORA_ENABLE_CPU_OFFLOAD", True)
    model_load_kwargs: dict[str, Any] = {
        "quantization_config": bnb_config,
        "device_map": "auto",
        "max_memory": max_memory,
        "trust_remote_code": True,
        "token": hf_token,
        "torch_dtype": torch.float16,
        "low_cpu_mem_usage": True,
    }

    if enable_cpu_offload:
        offload_dir = os.path.join(args.output, ".offload")
        os.makedirs(offload_dir, exist_ok=True)
        model_load_kwargs["offload_folder"] = offload_dir
        model_load_kwargs["offload_state_dict"] = True

    emit(
        "loading",
        30,
        "메모리 계획: "
        + ", ".join(f"{key}={value}" for key, value in max_memory.items())
        + f" | cpu_offload={'on' if enable_cpu_offload else 'off'}",
    )

    # Resolve model class (Qwen3.5 VLM needs text-only CausalLM)
    def _resolve_model_class(mid: str):
        try:
            cfg = AutoConfig.from_pretrained(mid, trust_remote_code=True)
            if getattr(cfg, 'model_type', '') == 'qwen3_5':
                from transformers import Qwen3_5ForCausalLM
                emit("loading", 29, "Qwen3.5 VLM 감지 — 텍스트 전용 CausalLM 사용")
                return Qwen3_5ForCausalLM
        except Exception:
            pass
        return AutoModelForCausalLM

    ModelClass = _resolve_model_class(args.model)
    model = ModelClass.from_pretrained(args.model, **model_load_kwargs)

    # Enable gradient checkpointing to cut activation VRAM, but skip the
    # default float32 upcasting inside prepare_model_for_kbit_training —
    # that in-place .to(float32) doubles peak VRAM on whichever GPU holds
    # each layer and causes OOM on 12 GB cards.
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    for param in model.parameters():
        param.requires_grad = False

    load_time = time.time() - t0
    emit("loading", 38, f"모델 로드 완료 ({load_time:.1f}s)")

    # ── Configure LoRA ─────────────────────────────────────────────────────
    # Qwen3.5 has Gated DeltaNet hybrid layers — include in_proj/out_proj in addition
    # to standard attention projections for better coverage
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "in_proj", "out_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    # Preserve the device map before PeftModel wrapping (get_peft_model may
    # not propagate hf_device_map).  The Trainer uses hf_device_map to detect
    # model-parallelism and skip nn.DataParallel wrapping.
    _device_map = getattr(model, "hf_device_map", None)

    model = get_peft_model(model, lora_config)

    if _device_map is not None and getattr(model, "hf_device_map", None) is None:
        model.hf_device_map = _device_map

    if getattr(model, "hf_device_map", None) is not None:
        emit(
            "loading",
            39,
            "모델 분산 배치: " + ", ".join(
                f"{name}={device}" for name, device in list(model.hf_device_map.items())[:8]
            ),
        )

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    emit(
        "loading",
        40,
        f"LoRA 적용: 학습 파라미터 {trainable_params:,} / 전체 {total_params:,} "
        f"({100 * trainable_params / total_params:.2f}%)",
    )

    # ── Estimate total steps ───────────────────────────────────────────────
    effective_batch = args.batch_size * args.grad_accum
    steps_per_epoch = max(1, len(chunks) // effective_batch)
    total_steps = steps_per_epoch * args.epochs

    # ── Training ───────────────────────────────────────────────────────────
    emit("training", 42, f"학습 시작: {args.epochs} epoch, {total_steps} steps, batch={effective_batch}")
    t1 = time.time()

    training_args = SFTConfig(
        output_dir=os.path.join(args.output, "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        bf16=True,
        optim="paged_adamw_8bit",
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=1,
        save_strategy="steps",
        save_steps=max(1, args.save_steps),
        save_total_limit=max(1, args.save_total_limit),
        max_length=seq_len,
        dataset_text_field="text",
        report_to="none",
    )

    # The base model is already split across multiple GPUs via device_map="auto".
    # Force Trainer to treat this as single-process model-parallel training so it
    # does not wrap the model in nn.DataParallel.
    training_args._n_gpu = 1

    progress_cb = _ProgressCB(total_steps)

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        processing_class=tokenizer,
        callbacks=[progress_cb],
    )

    latest_checkpoint = find_latest_checkpoint(training_args.output_dir)
    if latest_checkpoint:
        emit("training", 42, f"이전 체크포인트에서 재개: {os.path.basename(latest_checkpoint)}")
        trainer.train(resume_from_checkpoint=latest_checkpoint)
    else:
        trainer.train()
    train_time = time.time() - t1
    emit("training", 90, f"학습 완료! ({train_time:.1f}s)")

    # ── Save adapter ───────────────────────────────────────────────────────
    emit("saving", 92, "어댑터 저장 중...")
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    # Clean up training checkpoints dir
    ckpt_dir = os.path.join(args.output, "checkpoints")
    if os.path.isdir(ckpt_dir):
        import shutil
        shutil.rmtree(ckpt_dir, ignore_errors=True)

    # Free GPU memory
    del model, trainer
    gc.collect()
    torch.cuda.empty_cache()

    output_file = os.path.join(args.output, "adapter_model.safetensors")
    if not os.path.exists(output_file):
        # Some PEFT versions save as adapter_model.bin
        alt = os.path.join(args.output, "adapter_model.bin")
        if os.path.exists(alt):
            output_file = alt
        else:
            emit("error", 0, "어댑터 파일이 생성되지 않았습니다")
            sys.exit(1)

    file_size_mb = os.path.getsize(output_file) / (1024 * 1024)
    emit(
        "done",
        100,
        f"QLoRA 학습 완료! ({train_time:.1f}s, {file_size_mb:.1f}MB)",
        output=output_file,
    )


if __name__ == "__main__":
    main()
