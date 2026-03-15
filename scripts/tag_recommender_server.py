#!/usr/bin/env python3
"""
Tag recommender server — keeps models in memory for fast inference.

Loads Korean→English translation (MarianMT) and sentence-transformer once,
then serves tag recommendation requests over HTTP.

Usage:
  python3 scripts/tag_recommender_server.py [--port 9877]

Endpoints:
  POST /recommend  — recommend tags from texts
  POST /translate  — translate Korean→English only
  GET  /health     — health check
  POST /shutdown   — graceful shutdown
"""

import argparse
import json
import os
import re
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

import numpy as np

# ─── Paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
TAG_DB_PATH = os.path.join(PROJECT_DIR, "config", "prompt-tags.json")
CACHE_DIR = os.path.join(PROJECT_DIR, "data", "embeddings")
EMBEDDINGS_PATH = os.path.join(CACHE_DIR, "tag_embeddings.npz")
META_PATH = os.path.join(CACHE_DIR, "tag_meta.json")

EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
TRANSLATION_MODEL = "Helsinki-NLP/opus-mt-ko-en"

# CJK detection regex
CJK_RE = re.compile(r'[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]')
NON_ALNUM_RE = re.compile(r'[^a-z0-9+]+')

# ─── Global state ────────────────────────────────────────────────────────────
_embed_model = None
_translate_model = None
_translate_tokenizer = None
_tag_embeddings = None  # normalized
_tag_meta = None

SHORT_QUERY_WORD_LIMIT = 3
DIRECT_TAG_ALIASES = {
    "woman": ["1girl", "solo"],
    "women": ["multiple girls"],
    "girl": ["1girl", "solo"],
    "girls": ["multiple girls"],
    "female": ["1girl"],
    "females": ["multiple girls"],
    "lady": ["1girl", "solo"],
    "ladies": ["multiple girls"],
    "man": ["1boy", "solo"],
    "men": ["multiple boys"],
    "boy": ["1boy", "solo"],
    "boys": ["multiple boys"],
    "male": ["1boy"],
    "males": ["multiple boys"],
}


def load_all_models():
    """Load all models and caches into memory."""
    global _embed_model, _translate_model, _translate_tokenizer
    global _tag_embeddings, _tag_meta

    t0 = time.time()

    # 1. Sentence-transformer
    print("[server] Loading sentence-transformer...", file=sys.stderr)
    from sentence_transformers import SentenceTransformer
    _embed_model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"[server]   loaded in {time.time()-t0:.1f}s", file=sys.stderr)

    # 2. MarianMT translator
    t1 = time.time()
    print("[server] Loading MarianMT ko→en...", file=sys.stderr)
    from transformers import MarianMTModel, MarianTokenizer
    _translate_tokenizer = MarianTokenizer.from_pretrained(TRANSLATION_MODEL)
    _translate_model = MarianMTModel.from_pretrained(TRANSLATION_MODEL)
    print(f"[server]   loaded in {time.time()-t1:.1f}s", file=sys.stderr)

    # 3. Tag embedding cache
    t2 = time.time()
    print("[server] Loading tag embedding cache...", file=sys.stderr)
    if os.path.exists(EMBEDDINGS_PATH) and os.path.exists(META_PATH):
        data = np.load(EMBEDDINGS_PATH)
        emb = data["embeddings"]
        # Pre-normalize
        _tag_embeddings = emb / np.linalg.norm(emb, axis=1, keepdims=True)
        with open(META_PATH, "r", encoding="utf-8") as f:
            _tag_meta = json.load(f)
        print(f"[server]   {len(_tag_meta)} tags, loaded in {time.time()-t2:.1f}s", file=sys.stderr)
    else:
        print("[server]   WARNING: cache not found, run --build-cache first", file=sys.stderr)

    print(f"[server] All models ready in {time.time()-t0:.1f}s", file=sys.stderr)


def contains_cjk(text: str) -> bool:
    return bool(CJK_RE.search(text))


def normalize_text(text: str) -> str:
    return NON_ALNUM_RE.sub(" ", text.lower()).strip()


def build_direct_tag_results(query_texts: list[str], reasons: list[str], filtered_meta: list[dict]) -> list[dict]:
    meta_by_tag = {normalize_text(item["tag"]): item for item in filtered_meta}
    seen = {}

    for query_text, reason in zip(query_texts, reasons):
        normalized = normalize_text(query_text)
        if not normalized:
            continue

        direct_tags = []
        exact_match = meta_by_tag.get(normalized)
        if exact_match is not None:
            direct_tags.append((exact_match, 1.0))

        for alias in DIRECT_TAG_ALIASES.get(normalized, []):
            alias_match = meta_by_tag.get(normalize_text(alias))
            if alias_match is not None:
                direct_tags.append((alias_match, 0.99))

        for tag_info, score in direct_tags:
            key = tag_info["tag"].lower()
            if key not in seen or score > seen[key]["score"]:
                seen[key] = {
                    "tag": tag_info["tag"],
                    "category": tag_info["category"],
                    "categoryLabel": tag_info["categoryLabel"],
                    "color": tag_info["color"],
                    "reason": reason,
                    "score": score,
                }

    results = list(seen.values())
    results.sort(key=lambda item: -item["score"])
    return results


def translate_ko_to_en(texts: list[str]) -> list[str]:
    """Translate multiple Korean texts to English in a batch."""
    if not texts or _translate_model is None:
        return texts

    inputs = _translate_tokenizer(
        texts, return_tensors="pt", padding=True, truncation=True, max_length=512
    )
    translated = _translate_model.generate(**inputs)
    results = [
        _translate_tokenizer.decode(t, skip_special_tokens=True)
        for t in translated
    ]
    return results


def recommend(texts: dict, top_k: int = 30, threshold: float = 0.25,
              exclude_categories: list[str] | None = None,
              auto_split: bool = True,
              translate: bool = True) -> list[dict]:
    """
    Given {reason: text}, translate Korean→English, then find similar tags.
    """
    if exclude_categories is None:
        exclude_categories = ["artist"]
    if _tag_embeddings is None or _tag_meta is None:
        return []

    # Pre-filter categories
    excluded = set(exclude_categories)
    category_mask = np.array([m["category"] not in excluded for m in _tag_meta])
    filtered_indices = np.where(category_mask)[0]
    filtered_embeddings = _tag_embeddings[filtered_indices]
    filtered_meta = [_tag_meta[i] for i in filtered_indices]

    # Collect query pairs: (text, reason)
    query_pairs = []
    for reason, text in texts.items():
        if not text or not text.strip():
            continue
        if auto_split and len(text) >= 20:
            fragments = split_text_to_fragments(text)
            query_pairs.append((text, reason))
            for frag in fragments:
                query_pairs.append((frag, reason))
        else:
            query_pairs.append((text, reason))

    if not query_pairs:
        return []

    query_texts = [qp[0] for qp in query_pairs]
    translated_texts = list(query_texts)

    cjk_indices = [i for i, t in enumerate(query_texts) if contains_cjk(t)] if translate else []
    if cjk_indices:
        cjk_texts = [query_texts[i] for i in cjk_indices]
        en_texts = translate_ko_to_en(cjk_texts)
        for i, en in zip(cjk_indices, en_texts):
            translated_texts[i] = en
            print(f"[server]   translate: \"{query_texts[i]}\" → \"{en}\"", file=sys.stderr)

    reasons = [qp[1] for qp in query_pairs]
    direct_results = build_direct_tag_results(translated_texts, reasons, filtered_meta)
    is_short_query = len(query_pairs) == 1 and len(normalize_text(translated_texts[0]).split()) <= SHORT_QUERY_WORD_LIMIT
    if is_short_query and direct_results:
        return direct_results[:top_k]

    # Encode translated texts
    query_embeddings = _embed_model.encode(translated_texts, batch_size=32)
    query_embeddings = query_embeddings / np.linalg.norm(query_embeddings, axis=1, keepdims=True)

    # Compute similarities
    all_similarities = np.dot(query_embeddings, filtered_embeddings.T)

    # Aggregate: max score per tag
    seen = {item["tag"].lower(): item for item in direct_results}
    for qi, (_, reason) in enumerate(query_pairs):
        sims = all_similarities[qi]
        mask = sims >= threshold
        indices = np.where(mask)[0]
        if len(indices) == 0:
            continue
        scores = sims[indices]
        sorted_idx = np.argsort(-scores)[:top_k]
        for si in sorted_idx:
            idx = indices[si]
            score = float(scores[si])
            tag_info = filtered_meta[idx]
            key = tag_info["tag"].lower()
            if key not in seen or score > seen[key]["score"]:
                seen[key] = {
                    "tag": tag_info["tag"],
                    "category": tag_info["category"],
                    "categoryLabel": tag_info["categoryLabel"],
                    "color": tag_info["color"],
                    "reason": reason,
                    "score": round(score, 4),
                }

    results = list(seen.values())
    results.sort(key=lambda x: -x["score"])
    return results[:top_k]


MIN_FRAGMENT_LENGTH = 6

def split_text_to_fragments(text: str) -> list[str]:
    splitters = r'[,，.。\n;；!?！？·]|(?<=[\uAC00-\uD7A3])(?:이고|하고|이며|하며|에게|에서|으로|과|와|랑|이랑|에|가|은|는|도|의)(?=\s)'
    parts = re.split(splitters, text)
    fragments = [p.strip() for p in parts if p and len(p.strip()) >= MIN_FRAGMENT_LENGTH]
    return fragments if fragments else [text]


# ─── HTTP Server ─────────────────────────────────────────────────────────────

class RecommenderHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default access logs, print to stderr
        print(f"[server] {args[0]}", file=sys.stderr)

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw) if raw else {}

    def do_GET(self):
        if self.path == "/health":
            self._send_json({
                "status": "ok",
                "models_loaded": _embed_model is not None and _translate_model is not None,
                "tag_count": len(_tag_meta) if _tag_meta else 0,
            })
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path == "/recommend":
            self._handle_recommend()
        elif self.path == "/translate":
            self._handle_translate()
        elif self.path == "/shutdown":
            self._send_json({"status": "shutting down"})
            # Shutdown after response
            import threading
            threading.Thread(target=self.server.shutdown).start()
        else:
            self._send_json({"error": "not found"}, 404)

    def _handle_recommend(self):
        try:
            body = self._read_json()
            texts = body.get("texts", {})
            top_k = body.get("topK", 30)
            threshold = body.get("threshold", 0.25)
            exclude_cats = body.get("excludeCategories", ["artist"])
            auto_split = body.get("autoSplit", True)
            translate = body.get("translate", True)

            t0 = time.time()
            results = recommend(texts, top_k, threshold,
                                exclude_categories=exclude_cats,
                                auto_split=auto_split,
                                translate=translate)
            elapsed = time.time() - t0
            print(f"[server]   recommend: {len(results)} tags in {elapsed:.2f}s", file=sys.stderr)

            self._send_json({"tags": results})
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def _handle_translate(self):
        try:
            body = self._read_json()
            texts = body.get("texts", [])
            if isinstance(texts, str):
                texts = [texts]
            results = translate_ko_to_en(texts)
            self._send_json({"translations": results})
        except Exception as e:
            self._send_json({"error": str(e)}, 500)


def run_server(port: int):
    load_all_models()
    server = HTTPServer(("127.0.0.1", port), RecommenderHandler)
    print(f"[server] Listening on http://127.0.0.1:{port}", file=sys.stderr)
    # Write a ready signal to stdout so Node.js knows we're up
    print(json.dumps({"status": "ready", "port": port}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()
    print("[server] Shut down.", file=sys.stderr)


# ─── CLI (for build-cache and one-shot) ─────────────────────────────────────

def load_tag_db():
    with open(TAG_DB_PATH, "r", encoding="utf-8") as f:
        db = json.load(f)
    tags = []
    for cat in db["categories"]:
        for tag in cat["tags"]:
            tags.append({
                "tag": tag, "category": cat["id"],
                "categoryLabel": cat["label"], "color": cat["color"],
            })
    return tags


def build_cache():
    print(f"Loading tag database from {TAG_DB_PATH}...", file=sys.stderr)
    tags = load_tag_db()
    print(f"  {len(tags)} tags loaded", file=sys.stderr)

    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(EMBEDDING_MODEL)
    tag_texts = [t["tag"] for t in tags]
    print(f"Encoding {len(tag_texts)} tags...", file=sys.stderr)
    start = time.time()
    embeddings = model.encode(tag_texts, show_progress_bar=True, batch_size=256)
    elapsed = time.time() - start
    print(f"  Encoded in {elapsed:.1f}s, shape: {embeddings.shape}", file=sys.stderr)

    os.makedirs(CACHE_DIR, exist_ok=True)
    np.savez_compressed(EMBEDDINGS_PATH, embeddings=embeddings)
    meta = [{"tag": t["tag"], "category": t["category"],
             "categoryLabel": t["categoryLabel"], "color": t["color"]} for t in tags]
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)

    print(f"Cache saved: {EMBEDDINGS_PATH}", file=sys.stderr)
    result = {"status": "ok", "tagCount": len(tags),
              "embeddingShape": list(embeddings.shape)}
    print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser(description="Tag recommender server")
    parser.add_argument("--serve", action="store_true", help="Start HTTP server")
    parser.add_argument("--port", type=int, default=9877, help="Server port")
    parser.add_argument("--build-cache", action="store_true", help="Build embedding cache")
    args = parser.parse_args()

    if args.build_cache:
        build_cache()
    elif args.serve:
        run_server(args.port)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
