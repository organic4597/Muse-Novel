"""Local inference server for Qwen models with LoRA adapter support.
Provides an OpenAI-compatible API at http://localhost:8321/v1

Usage:
  python scripts/qwen_inference_server.py [--port 8321] [--model Qwen/Qwen3.5-9B-Base]

The LoRA adapter can be loaded/unloaded dynamically via:
  POST /v1/lora/load  {"adapter_path": "/path/to/adapter"}
  POST /v1/lora/unload
"""

import argparse
import gc
import json
import os
import sys
import tempfile
import threading
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

model = None
tokenizer = None
lora_loaded = False
lora_path = None
model_lock = threading.Lock()
model_id = "Qwen/Qwen3.5-9B-Base"


def parse_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def parse_max_memory_overrides(raw: str | None) -> dict[int | str, str]:
    if not raw:
        return {}

    overrides: dict[int | str, str] = {}
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue

        if "=" not in chunk:
            raise ValueError(f"잘못된 QLORA_MAX_MEMORY 형식: {chunk}")

        device, value = chunk.split("=", 1)
        device = device.strip()
        value = value.strip()

        if device.lower() == "cpu":
            overrides["cpu"] = value
        else:
            overrides[int(device)] = value

    return overrides


def build_max_memory(torch_module) -> dict[int | str, str]:
    max_memory: dict[int | str, str] = {}

    # QWEN_INFERENCE_GPU restricts model to a single GPU (e.g. "1" for 4070S).
    # Other GPUs get 0MiB so device_map="auto" skips them entirely.
    target_gpu = os.environ.get("QWEN_INFERENCE_GPU")

    if torch_module.cuda.is_available():
        for gpu_index in range(torch_module.cuda.device_count()):
            if target_gpu is not None and gpu_index != int(target_gpu):
                max_memory[gpu_index] = "0MiB"
            else:
                total_bytes = torch_module.cuda.get_device_properties(gpu_index).total_memory
                total_mib = total_bytes // (1024**2)
                usable_mib = max(1024, int(total_mib * 0.92))
                max_memory[gpu_index] = f"{usable_mib}MiB"

    overrides = parse_max_memory_overrides(os.environ.get("QLORA_MAX_MEMORY"))
    max_memory.update(overrides)
    return max_memory


def _resolve_model_class(mid: str):
    """Return the appropriate model class for the given model ID.
    For Qwen3.5 VLM models, use the text-only CausalLM class to skip vision encoder."""
    from transformers import AutoConfig, AutoModelForCausalLM
    try:
        cfg = AutoConfig.from_pretrained(mid, trust_remote_code=True)
        if getattr(cfg, 'model_type', '') == 'qwen3_5':
            from transformers import Qwen3_5ForCausalLM
            print(f"[qwen-server] Detected Qwen3.5 VLM — loading text-only CausalLM", flush=True)
            return Qwen3_5ForCausalLM
    except Exception:
        pass
    return AutoModelForCausalLM


def load_base_model(mid: str):
    global model, tokenizer, model_id
    import torch
    from transformers import AutoTokenizer, BitsAndBytesConfig
    from transformers.models.qwen3_5 import modeling_qwen3_5 as qwen3_5_modeling

    model_id = mid
    hf_token = os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(
        mid, trust_remote_code=True, token=hf_token
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    max_memory = build_max_memory(torch)
    enable_cpu_offload = parse_bool_env("QLORA_ENABLE_CPU_OFFLOAD", False)

    # When QWEN_INFERENCE_GPU is set, put all layers on that specific GPU
    # instead of letting device_map="auto" scatter across GPUs.
    target_gpu = os.environ.get("QWEN_INFERENCE_GPU")
    if target_gpu is not None:
        device_map = {"": int(target_gpu)}
    else:
        device_map = "auto"

    model_load_kwargs = {
        "quantization_config": bnb_config,
        "device_map": device_map,
        **({"max_memory": max_memory} if target_gpu is None else {}),
        "trust_remote_code": True,
        "token": hf_token,
        "torch_dtype": torch.float16,
        "low_cpu_mem_usage": True,
    }

    if enable_cpu_offload:
        offload_dir = os.environ.get(
            "QWEN_LOCAL_OFFLOAD_DIR",
            os.path.join(tempfile.gettempdir(), "qwen-local-offload"),
        )
        os.makedirs(offload_dir, exist_ok=True)
        model_load_kwargs["offload_folder"] = offload_dir
        model_load_kwargs["offload_state_dict"] = True

    print(
        "[qwen-server] Memory plan: "
        + f"device_map={device_map}"
        + (", " + ", ".join(f"{key}={value}" for key, value in max_memory.items()) if target_gpu is None else "")
        + f" | cpu_offload={'on' if enable_cpu_offload else 'off'}",
        flush=True,
    )
    print(
        "[qwen-server] Qwen3.5 fast path: "
        + ("on" if qwen3_5_modeling.is_fast_path_available else "off")
        + f" | causal_conv1d_fn={'on' if qwen3_5_modeling.causal_conv1d_fn else 'off'}"
        + f" | causal_conv1d_update={'on' if qwen3_5_modeling.causal_conv1d_update else 'off'}"
        + f" | chunk_gated_delta_rule={'on' if qwen3_5_modeling.chunk_gated_delta_rule else 'off'}"
        + f" | fused_recurrent_gated_delta_rule={'on' if qwen3_5_modeling.fused_recurrent_gated_delta_rule else 'off'}",
        flush=True,
    )

    ModelClass = _resolve_model_class(mid)
    model = ModelClass.from_pretrained(
        mid,
        **model_load_kwargs,
    )
    model.eval()


def load_lora(adapter_path: str):
    global model, lora_loaded, lora_path
    from peft import PeftModel

    if lora_loaded:
        unload_lora()

    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()
    lora_loaded = True
    lora_path = adapter_path


def unload_lora():
    global model, lora_loaded, lora_path
    if not lora_loaded:
        return
    model = model.unload()
    lora_loaded = False
    lora_path = None
    gc.collect()
    import torch
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def generate_response(messages: list, max_tokens: int = 2048, temperature: float = 0.7, stream: bool = False):
    import torch

    text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    if stream:
        from transformers import TextIteratorStreamer
        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
        gen_kwargs = {
            **inputs,
            "max_new_tokens": max_tokens,
            "temperature": max(temperature, 0.01),
            "do_sample": temperature > 0,
            "top_p": 0.9,
            "streamer": streamer,
        }
        thread = threading.Thread(target=model.generate, kwargs=gen_kwargs)
        thread.start()
        return streamer
    else:
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=max(temperature, 0.01),
                do_sample=temperature > 0,
                top_p=0.9,
            )
        new_tokens = outputs[0][inputs["input_ids"].shape[-1]:]
        return tokenizer.decode(new_tokens, skip_special_tokens=True)


def generate_completion(prompt: str, max_tokens: int = 64, temperature: float = 0.1,
                        repetition_penalty: float = 1.2, min_tokens: int = 0,
                        no_repeat_ngram_size: int = 0, top_k: int = 0,
                        stop: list | None = None):
    """Raw text completion — no chat template, just continue from the prompt."""
    import torch

    t0 = time.time()
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    t_tok = time.time()

    gen_kwargs = {
        **inputs,
        "max_new_tokens": max_tokens,
        "min_new_tokens": min(min_tokens, max_tokens),
        "temperature": max(temperature, 0.01),
        "do_sample": temperature > 0,
        "top_p": 0.9,
        "repetition_penalty": repetition_penalty,
    }
    if no_repeat_ngram_size > 0:
        gen_kwargs["no_repeat_ngram_size"] = no_repeat_ngram_size
    if top_k > 0:
        gen_kwargs["top_k"] = top_k

    with torch.inference_mode():
        outputs = model.generate(**gen_kwargs)

    t_gen = time.time()
    new_tokens = outputs[0][inputs["input_ids"].shape[-1]:]
    n_prompt = inputs["input_ids"].shape[-1]
    n_gen = len(new_tokens)
    text = tokenizer.decode(new_tokens, skip_special_tokens=True)
    t_dec = time.time()
    print(f"[perf] tok={t_tok-t0:.3f}s gen={t_gen-t_tok:.3f}s decode={t_dec-t_gen:.3f}s | prompt={n_prompt} gen={n_gen} | {n_gen/(t_gen-t_tok):.1f} tok/s", flush=True)

    # Post-process: truncate at the first stop sequence
    if stop:
        earliest = len(text)
        for seq in stop:
            idx = text.find(seq)
            if idx != -1 and idx < earliest:
                earliest = idx
        text = text[:earliest]

    return text


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default logging noise
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw) if raw else {}

    def do_GET(self):
        if self.path == "/v1/models":
            self._send_json({
                "data": [{
                    "id": model_id,
                    "object": "model",
                    "owned_by": "local",
                }]
            })
        elif self.path == "/v1/lora/status":
            self._send_json({
                "loaded": lora_loaded,
                "adapter_path": lora_path,
            })
        elif self.path == "/health":
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path == "/v1/chat/completions":
            self._handle_chat()
        elif self.path == "/v1/completions":
            self._handle_completions()
        elif self.path == "/v1/lora/load":
            self._handle_lora_load()
        elif self.path == "/v1/lora/unload":
            self._handle_lora_unload()
        else:
            self._send_json({"error": "not found"}, 404)

    def _handle_chat(self):
        data = self._read_json()
        messages = data.get("messages", [])
        max_tokens = data.get("max_tokens", 2048)
        temperature = data.get("temperature", 0.7)
        stream = data.get("stream", False)
        req_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"

        with model_lock:
            if stream:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()

                streamer = generate_response(messages, max_tokens, temperature, stream=True)
                for token in streamer:
                    chunk = {
                        "id": req_id,
                        "object": "chat.completion.chunk",
                        "choices": [{
                            "index": 0,
                            "delta": {"content": token},
                            "finish_reason": None,
                        }],
                    }
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                    self.wfile.flush()

                done_chunk = {
                    "id": req_id,
                    "object": "chat.completion.chunk",
                    "choices": [{
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop",
                    }],
                }
                self.wfile.write(f"data: {json.dumps(done_chunk)}\n\n".encode())
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            else:
                text = generate_response(messages, max_tokens, temperature, stream=False)
                self._send_json({
                    "id": req_id,
                    "object": "chat.completion",
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": text},
                        "finish_reason": "stop",
                    }],
                })

    def _handle_completions(self):
        data = self._read_json()
        prompt = data.get("prompt", "")
        max_tokens = data.get("max_tokens", 64)
        temperature = data.get("temperature", 0.1)
        repetition_penalty = data.get("repetition_penalty", 1.2)
        min_tokens = data.get("min_tokens", 0)
        no_repeat_ngram_size = data.get("no_repeat_ngram_size", 0)
        top_k = data.get("top_k", 0)
        stop = data.get("stop", None)
        if isinstance(stop, str):
            stop = [stop]
        req_id = f"cmpl-{uuid.uuid4().hex[:8]}"

        if not prompt:
            self._send_json({"error": "prompt is required"}, 400)
            return

        with model_lock:
            text = generate_completion(prompt, max_tokens, temperature, repetition_penalty, min_tokens, no_repeat_ngram_size, top_k, stop)
            self._send_json({
                "id": req_id,
                "object": "text_completion",
                "choices": [{
                    "index": 0,
                    "text": text,
                    "finish_reason": "stop",
                }],
            })

    def _handle_lora_load(self):
        data = self._read_json()
        adapter_path = data.get("adapter_path", "")
        if not adapter_path or not os.path.isdir(adapter_path):
            self._send_json({"error": f"Invalid adapter path: {adapter_path}"}, 400)
            return
        with model_lock:
            try:
                load_lora(adapter_path)
                self._send_json({"status": "loaded", "adapter_path": adapter_path})
            except Exception as e:
                self._send_json({"error": str(e)}, 500)

    def _handle_lora_unload(self):
        with model_lock:
            unload_lora()
            self._send_json({"status": "unloaded"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8321)
    parser.add_argument("--model", default="Qwen/Qwen3.5-9B-Base")
    parser.add_argument("--lora", default=None, help="Pre-load a LoRA adapter")
    args = parser.parse_args()

    print(f"[qwen-server] Loading model {args.model}...", flush=True)
    t0 = time.time()
    load_base_model(args.model)
    print(f"[qwen-server] Model loaded in {time.time()-t0:.1f}s", flush=True)

    if args.lora:
        print(f"[qwen-server] Loading LoRA adapter: {args.lora}", flush=True)
        load_lora(args.lora)
        print("[qwen-server] LoRA loaded", flush=True)

    server = HTTPServer(("0.0.0.0", args.port), Handler)
    print(f"[qwen-server] Serving at http://0.0.0.0:{args.port}/v1", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[qwen-server] Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
