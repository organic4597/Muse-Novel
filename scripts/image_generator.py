#!/usr/bin/env python3
"""
Character image generator using HuggingFace diffusers.
Spawned as a subprocess by the Node.js backend.

Usage:
  python3 scripts/image_generator.py --config <json_file>

The config JSON should contain:
  {
    "prompt": "...",
    "negativePrompt": "...",
    "width": 512,
    "height": 512,
    "steps": 20,
    "cfgScale": 7,
    "batchSize": 4,
    "seed": -1,
    "outputDir": "/path/to/output",
    "modelId": "stabilityai/stable-diffusion-xl-base-1.0",
    "gpu": "0"
  }

Outputs a JSON result to stdout with the generated file paths.
"""

import argparse
import json
import os
import sys
import time


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


def main():
    parser = argparse.ArgumentParser(description="Generate images with diffusers")
    parser.add_argument("--config", required=True, help="Path to JSON config file")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        config = json.load(f)

    prompt = config["prompt"]
    negative_prompt = config.get("negativePrompt", "")
    width = config.get("width", 512)
    height = config.get("height", 512)
    steps = config.get("steps", 20)
    cfg_scale = config.get("cfgScale", 7.0)
    batch_size = config.get("batchSize", 1)
    seed = config.get("seed", -1)
    output_dir = config["outputDir"]
    model_id = config.get("modelId", "OnomaAIResearch/Illustrious-XL-v1.1")
    gpu = config.get("gpu", "0")
    scheduler_name = config.get("scheduler", "euler_a")
    lora_path = config.get("loraPath", None)
    lora_weight = config.get("loraWeight", 1.0)

    # Pin to specific GPU
    os.environ["CUDA_VISIBLE_DEVICES"] = str(gpu)

    # Print progress to stderr (stdout is reserved for JSON result)
    def log(msg: str):
        print(f"[image-gen] {msg}", file=sys.stderr, flush=True)

    log(f"Loading model: {model_id} on GPU {gpu}")
    # Emit loading status
    print(f'[PROGRESS]{json.dumps({"type": "status", "status": "loading_model", "message": "모델 로딩 중..."})}', file=sys.stderr, flush=True)
    start = time.time()

    import torch
    from diffusers import (
        StableDiffusionXLPipeline,
        StableDiffusionPipeline,
        EulerAncestralDiscreteScheduler,
        EulerDiscreteScheduler,
        DPMSolverMultistepScheduler,
    )

    # Determine pipeline class based on model
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

    # Set scheduler
    scheduler_map = {
        "euler_a": EulerAncestralDiscreteScheduler,
        "euler": EulerDiscreteScheduler,
        "dpm++_2m": DPMSolverMultistepScheduler,
    }
    SchedulerClass = scheduler_map.get(scheduler_name)
    if SchedulerClass:
        pipe.scheduler = SchedulerClass.from_config(pipe.scheduler.config)

    # Load model directly to GPU — 12GB VRAM is enough for SDXL.
    # CPU offload adds ~30s latency per generation due to layer transfers.
    pipe = pipe.to("cuda")

    # VAE tiling: decode latents in tiles instead of all at once.
    # Critical for high-res (1024x1024+) — prevents OOM during VAE decode.
    pipe.vae.enable_tiling()

    # VAE slicing: process batch images through VAE one at a time.
    # Reduces peak VRAM when batchSize > 1.
    pipe.vae.enable_slicing()

    # Load LoRA weights if provided
    if lora_path and os.path.isfile(lora_path):
        log(f"Loading LoRA: {lora_path} (weight={lora_weight})")
        print(f'[PROGRESS]{json.dumps({"type": "status", "status": "loading_lora", "message": "LoRA 로딩 중..."})}', file=sys.stderr, flush=True)
        try:
            pipe.load_lora_weights(lora_path, adapter_name="civitai_lora")
            pipe.set_adapters(["civitai_lora"], adapter_weights=[lora_weight])
            log(f"LoRA loaded successfully")
        except (ValueError, RuntimeError) as e:
            error_msg = str(e)
            if "not been correctly renamed" in error_msg or "lokr" in error_msg.lower():
                log(f"WARNING: LoRA uses LoKR/LyCORIS format not supported by current diffusers. Generating without LoRA.")
                print(f'[PROGRESS]{json.dumps({"type": "status", "status": "loading_lora", "message": "LoKR 포맷 미지원 — LoRA 없이 진행합니다"})}', file=sys.stderr, flush=True)
            else:
                log(f"ERROR: Failed to load LoRA: {error_msg}")
                raise
    elif lora_path:
        log(f"WARNING: LoRA file not found: {lora_path}")

    try:
        pipe.enable_xformers_memory_efficient_attention()
        log("xformers enabled")
    except Exception:
        log("xformers not available, using default attention")

    load_time = time.time() - start
    log(f"Model loaded in {load_time:.1f}s")
    print(f'[PROGRESS]{json.dumps({"type": "status", "status": "generating", "message": f"모델 로딩 완료 ({load_time:.0f}초). 생성 시작..."})}', file=sys.stderr, flush=True)

    os.makedirs(output_dir, exist_ok=True)

    # Generate images
    generator = None
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
    gen_start = time.time()

    # Step callback for progress reporting
    def step_callback(pipe_obj, step_index, timestep, callback_kwargs):
        progress = round((step_index + 1) / steps * 100)
        elapsed = time.time() - gen_start
        # JSON progress line on stderr for the Node.js parent to parse
        progress_data = json.dumps({
            "type": "progress",
            "step": step_index + 1,
            "totalSteps": steps,
            "progress": progress,
            "elapsed": round(elapsed, 1),
        })
        print(f"[PROGRESS]{progress_data}", file=sys.stderr, flush=True)
        return callback_kwargs

    gen_kwargs["callback_on_step_end"] = step_callback

    result = pipe(**gen_kwargs)

    gen_time = time.time() - gen_start
    log(f"Generation done in {gen_time:.1f}s")
    print(f'[PROGRESS]{json.dumps({"type": "status", "status": "saving", "message": "이미지 저장 중..."})}', file=sys.stderr, flush=True)

    # Save images and build result
    images_out = []
    for i, img in enumerate(result.images):
        import uuid
        filename = f"{uuid.uuid4()}.png"
        filepath = os.path.join(output_dir, filename)
        img.save(filepath)
        images_out.append({
            "filename": filename,
            "seed": actual_seed + i,
            "width": width,
            "height": height,
        })
        log(f"Saved: {filename}")

    # Explicitly free GPU memory
    del pipe
    del result
    torch.cuda.empty_cache()
    log("GPU memory freed")

    # Output JSON result to stdout
    output = {
        "success": True,
        "images": images_out,
        "prompt": prompt,
        "negativePrompt": negative_prompt,
        "modelId": model_id,
        "loadTime": round(load_time, 1),
        "genTime": round(gen_time, 1),
    }
    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        error_output = {
            "success": False,
            "error": str(e),
        }
        print(json.dumps(error_output))
        sys.exit(1)
