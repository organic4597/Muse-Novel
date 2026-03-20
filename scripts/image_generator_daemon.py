#!/usr/bin/env python3
"""
Persistent image generation daemon using HuggingFace diffusers.

Loads the model ONCE at startup (or on first job) and accepts multiple
generation jobs via stdin as JSON lines.  Results are written as JSON
lines to stdout.  Progress events go to stderr as [PROGRESS]{...} lines.

Protocol
--------
- **stdin**  → one JSON object per line (job request)
- **stdout** → one JSON object per line (job result)
- **stderr** → log lines + ``[PROGRESS]{...}`` events

Startup
-------
    python3 scripts/image_generator_daemon.py --gpu 0 --model <model_id>

The daemon loads the specified model on the given GPU immediately,
then emits a ``ready`` status event on stderr and enters the job loop.

Shutdown
--------
- EOF on stdin  → clean exit
- SIGTERM       → clean exit
"""

import argparse
import json
import os
import signal
import sys
import time
import uuid


# ---------------------------------------------------------------------------
# Logging helpers (same conventions as image_generator.py)
# ---------------------------------------------------------------------------


def log(msg: str):
    print(f"[image-gen-daemon] {msg}", file=sys.stderr, flush=True)


def emit_status(status: str, message: str, **extra):
    payload = {
        "type": "status",
        "status": status,
        "message": message,
        **extra,
    }
    print(f"[PROGRESS]{json.dumps(payload)}", file=sys.stderr, flush=True)


def duration_ms(started_at: float) -> int:
    return round((time.time() - started_at) * 1000)


# ---------------------------------------------------------------------------
# Single-file checkpoint resolver (identical to image_generator.py)
# ---------------------------------------------------------------------------


def resolve_single_file_checkpoint(model_id: str, is_sdxl: bool):
    if model_id.endswith(".safetensors") and os.path.exists(model_id):
        return model_id, (
            "stabilityai/stable-diffusion-xl-base-1.0"
            if is_sdxl
            else "runwayml/stable-diffusion-v1-5"
        )

    if "/" not in model_id:
        return None, None

    from huggingface_hub import hf_hub_download, model_info

    info = model_info(model_id)
    filenames = [s.rfilename for s in info.siblings]
    safetensors_files = [name for name in filenames if name.endswith(".safetensors")]
    has_diffusers_layout = "model_index.json" in filenames

    if has_diffusers_layout or len(safetensors_files) != 1:
        return None, None

    checkpoint_path = hf_hub_download(repo_id=model_id, filename=safetensors_files[0])
    base_config = (
        "stabilityai/stable-diffusion-xl-base-1.0"
        if is_sdxl
        else "runwayml/stable-diffusion-v1-5"
    )
    return checkpoint_path, base_config


# ---------------------------------------------------------------------------
# Model loading (mirrors image_generator.py lines 112-214)
# ---------------------------------------------------------------------------


def load_pipeline(model_id: str, scheduler_name: str = "euler_a"):
    """Load a diffusers pipeline to CUDA.  Returns ``(pipe, is_sdxl)``."""
    import torch
    from diffusers import (
        StableDiffusionXLPipeline,
        StableDiffusionPipeline,
        EulerAncestralDiscreteScheduler,
        EulerDiscreteScheduler,
        DPMSolverMultistepScheduler,
    )

    is_sdxl = "xl" in model_id.lower() or "sdxl" in model_id.lower()
    PipelineClass = StableDiffusionXLPipeline if is_sdxl else StableDiffusionPipeline

    checkpoint_path, base_config = resolve_single_file_checkpoint(model_id, is_sdxl)
    if checkpoint_path:
        log(f"Loading single-file checkpoint: {checkpoint_path}")
        pipe = PipelineClass.from_single_file(
            checkpoint_path,
            config=base_config,
            torch_dtype=torch.float16,
            use_safetensors=True,
        )
    else:
        pipe = PipelineClass.from_pretrained(
            model_id,
            torch_dtype=torch.float16,
            variant="fp16",
            use_safetensors=True,
        )

    # Scheduler
    scheduler_map = {
        "euler_a": EulerAncestralDiscreteScheduler,
        "euler": EulerDiscreteScheduler,
        "dpm++_2m": DPMSolverMultistepScheduler,
    }
    SchedulerClass = scheduler_map.get(scheduler_name)
    if SchedulerClass:
        pipe.scheduler = SchedulerClass.from_config(pipe.scheduler.config)

    pipe = pipe.to("cuda")

    # VAE optimisations
    pipe.vae.enable_tiling()
    pipe.vae.enable_slicing()

    try:
        pipe.enable_xformers_memory_efficient_attention()
        log("xformers enabled")
    except Exception:
        log("xformers not available, using default attention")

    return pipe, is_sdxl


# ---------------------------------------------------------------------------
# LoRA helpers
# ---------------------------------------------------------------------------

_loaded_lora_key: str | None = None  # "path|weight"


def _lora_cache_key(path: str | None, weight: float) -> str | None:
    if not path:
        return None
    return f"{path}|{weight}"


def apply_lora(pipe, lora_path: str | None, lora_weight: float):
    """Load LoRA if changed since last call.  Returns ``lora_load_ms``."""
    global _loaded_lora_key

    new_key = _lora_cache_key(lora_path, lora_weight)

    # Already loaded with same params
    if new_key == _loaded_lora_key:
        return 0

    # Unload previous LoRA (if any)
    if _loaded_lora_key is not None:
        try:
            pipe.unload_lora_weights()
        except Exception:
            pass
        _loaded_lora_key = None

    if not lora_path or not os.path.isfile(lora_path):
        if lora_path:
            log(f"WARNING: LoRA file not found: {lora_path}")
        return 0

    log(f"Loading LoRA: {lora_path} (weight={lora_weight})")
    emit_status("loading_lora", "LoRA 로딩 중...", stage="lora_load")
    lora_start = time.time()
    try:
        pipe.load_lora_weights(lora_path, adapter_name="civitai_lora")
        pipe.set_adapters(["civitai_lora"], adapter_weights=[lora_weight])
        lora_load_ms = duration_ms(lora_start)
        _loaded_lora_key = new_key
        log("LoRA loaded successfully")
        return lora_load_ms
    except (ValueError, RuntimeError) as e:
        error_msg = str(e)
        if "not been correctly renamed" in error_msg or "lokr" in error_msg.lower():
            log(
                "WARNING: LoRA uses LoKR/LyCORIS format not supported. Generating without LoRA."
            )
            lora_load_ms = duration_ms(lora_start)
            emit_status(
                "loading_lora",
                "LoKR 포맷 미지원 — LoRA 없이 진행합니다",
                stage="lora_load",
                durationMs=lora_load_ms,
                timings={"loraLoadMs": lora_load_ms},
            )
            return lora_load_ms
        else:
            log(f"ERROR: Failed to load LoRA: {error_msg}")
            raise


# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------


def process_job(pipe, job: dict) -> dict:
    """Run a single generation job and return the result dict."""
    import torch

    prompt = job["prompt"]
    negative_prompt = job.get("negativePrompt", "")
    width = job.get("width", 512)
    height = job.get("height", 512)
    steps = job.get("steps", 20)
    cfg_scale = job.get("cfgScale", 7.0)
    batch_size = job.get("batchSize", 1)
    seed = job.get("seed", -1)
    output_dir = job["outputDir"]
    scheduler_name = job.get("scheduler", "euler_a")
    lora_path = job.get("loraPath", None)
    lora_weight = job.get("loraWeight", 1.0)

    total_start = time.time()

    # LoRA handling (cached)
    lora_load_ms = apply_lora(pipe, lora_path, lora_weight)

    # Scheduler update (lightweight — just replaces the scheduler object)
    from diffusers import (
        EulerAncestralDiscreteScheduler,
        EulerDiscreteScheduler,
        DPMSolverMultistepScheduler,
    )

    scheduler_map = {
        "euler_a": EulerAncestralDiscreteScheduler,
        "euler": EulerDiscreteScheduler,
        "dpm++_2m": DPMSolverMultistepScheduler,
    }
    SchedulerClass = scheduler_map.get(scheduler_name)
    if SchedulerClass:
        pipe.scheduler = SchedulerClass.from_config(pipe.scheduler.config)

    os.makedirs(output_dir, exist_ok=True)

    actual_seed = seed
    if seed < 0:
        actual_seed = torch.randint(0, 2**32 - 1, (1,)).item()

    generators = [
        torch.Generator(device="cuda").manual_seed(actual_seed + i)
        for i in range(batch_size)
    ]

    gen_kwargs = {
        "prompt": [prompt] * batch_size,
        "negative_prompt": [negative_prompt] * batch_size if negative_prompt else None,
        "width": width,
        "height": height,
        "num_inference_steps": steps,
        "guidance_scale": cfg_scale,
        "generator": generators,
    }

    log(f"Generating {batch_size} image(s): {width}x{height}, {steps} steps")
    emit_status(
        "generating",
        f"생성 시작... ({batch_size}장, {width}x{height})",
        stage="generation",
        timings={
            **({"loraLoadMs": lora_load_ms} if lora_load_ms else {}),
        },
    )
    gen_start = time.time()

    def step_callback(pipe_obj, step_index, timestep, callback_kwargs):
        progress = round((step_index + 1) / steps * 100)
        elapsed = time.time() - gen_start
        progress_data = json.dumps(
            {
                "type": "progress",
                "step": step_index + 1,
                "totalSteps": steps,
                "progress": progress,
                "elapsed": round(elapsed, 1),
            }
        )
        print(f"[PROGRESS]{progress_data}", file=sys.stderr, flush=True)
        return callback_kwargs

    gen_kwargs["callback_on_step_end"] = step_callback

    result = pipe(**gen_kwargs)

    gen_time = time.time() - gen_start
    generation_ms = round(gen_time * 1000)
    log(f"Generation done in {gen_time:.1f}s")
    emit_status(
        "saving",
        "이미지 저장 중...",
        stage="generation",
        durationMs=generation_ms,
        timings={
            **({"loraLoadMs": lora_load_ms} if lora_load_ms else {}),
            "generationMs": generation_ms,
        },
    )

    images_out = []
    save_start = time.time()
    for i, img in enumerate(result.images):
        filename = f"{uuid.uuid4()}.png"
        filepath = os.path.join(output_dir, filename)
        img.save(filepath)
        images_out.append(
            {
                "filename": filename,
                "seed": actual_seed + i,
                "width": width,
                "height": height,
            }
        )
        log(f"Saved: {filename}")

    image_save_ms = duration_ms(save_start)
    total_ms = duration_ms(total_start)

    emit_status(
        "provider_complete",
        "이미지 파일 저장 완료",
        stage="image_save",
        durationMs=image_save_ms,
        timings={
            **({"loraLoadMs": lora_load_ms} if lora_load_ms else {}),
            "generationMs": generation_ms,
            "imageSaveMs": image_save_ms,
            "totalMs": total_ms,
        },
    )

    return {
        "success": True,
        "images": images_out,
        "prompt": prompt,
        "negativePrompt": negative_prompt,
        "modelId": job.get("modelId", ""),
        "loadTime": 0,
        "genTime": round(gen_time, 1),
        "timings": {
            "modelLoadMs": 0,
            **({"loraLoadMs": lora_load_ms} if lora_load_ms else {}),
            "generationMs": generation_ms,
            "imageSaveMs": image_save_ms,
            "totalMs": total_ms,
        },
    }


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Persistent diffusers daemon")
    parser.add_argument("--gpu", default="0", help="CUDA device index")
    parser.add_argument(
        "--model",
        default="OnomaAIResearch/Illustrious-XL-v1.1",
        help="HuggingFace model ID or local path",
    )
    parser.add_argument(
        "--display-vram-reserve-mb",
        type=int,
        default=0,
        help="MB of VRAM to reserve for display output (0 = no limit)",
    )
    args = parser.parse_args()

    os.environ["CUDA_VISIBLE_DEVICES"] = str(args.gpu)

    if args.display_vram_reserve_mb and args.display_vram_reserve_mb > 0:
        import torch

        try:
            props = torch.cuda.get_device_properties(0)
            total_bytes = props.total_memory
            reserve_bytes = args.display_vram_reserve_mb * 1024 * 1024
            fraction = max(0.5, (total_bytes - reserve_bytes) / total_bytes)
            torch.cuda.set_per_process_memory_fraction(fraction, 0)
            log(
                f"VRAM limit: {fraction:.1%} ({args.display_vram_reserve_mb}MB reserved for display, total {total_bytes // 1024 // 1024}MB)"
            )
        except Exception as e:
            log(f"VRAM limit skipped: {e}")

    # --- Warm up: load model immediately ---
    log(f"Loading model: {args.model} on GPU {args.gpu}")
    emit_status("loading_model", "모델 로딩 중...", stage="model_load")
    load_start = time.time()

    pipe, _is_sdxl = load_pipeline(args.model)

    model_load_ms = duration_ms(load_start)
    log(f"Model loaded in {model_load_ms}ms")
    emit_status(
        "ready",
        "Daemon ready",
        stage="model_load",
        durationMs=model_load_ms,
    )

    # --- Graceful shutdown ---
    shutdown_requested = False

    def handle_signal(_signum, _frame):
        nonlocal shutdown_requested
        shutdown_requested = True
        log("Shutdown signal received")

    signal.signal(signal.SIGTERM, handle_signal)

    # --- Job loop: read one JSON line → process → write one JSON line ---
    log("Entering job loop (reading from stdin)")
    for raw_line in sys.stdin:
        if shutdown_requested:
            break

        raw_line = raw_line.strip()
        if not raw_line:
            continue

        try:
            job = json.loads(raw_line)
        except json.JSONDecodeError as e:
            error_result = {"success": False, "error": f"Invalid JSON: {e}"}
            sys.stdout.write(json.dumps(error_result) + "\n")
            sys.stdout.flush()
            continue

        try:
            result = process_job(pipe, job)
        except Exception as e:
            import traceback

            traceback.print_exc(file=sys.stderr)
            result = {"success": False, "error": str(e)}

        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()

    # --- Cleanup ---
    log("Shutting down daemon")
    import torch

    del pipe
    torch.cuda.empty_cache()
    log("GPU memory freed — exiting")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback

        traceback.print_exc(file=sys.stderr)
        log(f"Fatal error: {e}")
        sys.exit(1)
