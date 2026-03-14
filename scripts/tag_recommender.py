#!/usr/bin/env python3
"""
Embedding-based tag recommender using sentence-transformers.
Supports Korean↔English cross-language matching.

Usage:
  # Build/update tag embedding cache
  python3 scripts/tag_recommender.py --build-cache

  # Recommend tags from text
  python3 scripts/tag_recommender.py --text "빨간 머리에 파란 눈의 소녀가 숲에서 검을 들고 서있다"

  # Recommend from JSON config (for subprocess call)
  python3 scripts/tag_recommender.py --config /tmp/recommend_config.json

Config JSON:
  {
    "texts": {"외모": "...", "성격": "...", ...},
    "topK": 30,
    "threshold": 0.25
  }

Outputs JSON to stdout.
"""

import argparse
import json
import os
import sys
import time
import numpy as np

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
TAG_DB_PATH = os.path.join(PROJECT_DIR, "config", "prompt-tags.json")
CACHE_DIR = os.path.join(PROJECT_DIR, "data", "embeddings")
EMBEDDINGS_PATH = os.path.join(CACHE_DIR, "tag_embeddings.npz")
META_PATH = os.path.join(CACHE_DIR, "tag_meta.json")

# Model — multilingual, good for Korean↔English, ~120MB
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def load_tag_db():
    """Load all tags from prompt-tags.json."""
    with open(TAG_DB_PATH, "r", encoding="utf-8") as f:
        db = json.load(f)

    tags = []
    for cat in db["categories"]:
        for tag in cat["tags"]:
            tags.append({
                "tag": tag,
                "category": cat["id"],
                "categoryLabel": cat["label"],
                "color": cat["color"],
            })
    return tags


def get_model():
    """Load the sentence-transformer model."""
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(MODEL_NAME)


def build_cache():
    """Pre-compute embeddings for all tags and save to disk."""
    print(f"Loading tag database from {TAG_DB_PATH}...", file=sys.stderr)
    tags = load_tag_db()
    print(f"  {len(tags)} tags loaded", file=sys.stderr)

    print(f"Loading model {MODEL_NAME}...", file=sys.stderr)
    model = get_model()

    # Encode all tag names
    tag_texts = [t["tag"] for t in tags]
    print(f"Encoding {len(tag_texts)} tags...", file=sys.stderr)
    start = time.time()
    embeddings = model.encode(tag_texts, show_progress_bar=True, batch_size=256)
    elapsed = time.time() - start
    print(f"  Encoded in {elapsed:.1f}s, shape: {embeddings.shape}", file=sys.stderr)

    # Save
    os.makedirs(CACHE_DIR, exist_ok=True)
    np.savez_compressed(EMBEDDINGS_PATH, embeddings=embeddings)

    meta = [{"tag": t["tag"], "category": t["category"],
             "categoryLabel": t["categoryLabel"], "color": t["color"]}
            for t in tags]
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)

    print(f"Cache saved: {EMBEDDINGS_PATH} ({os.path.getsize(EMBEDDINGS_PATH) / 1024 / 1024:.1f}MB)", file=sys.stderr)
    print(f"Meta saved: {META_PATH}", file=sys.stderr)

    # Output result
    result = {"status": "ok", "tagCount": len(tags),
              "embeddingShape": list(embeddings.shape),
              "cacheSize": os.path.getsize(EMBEDDINGS_PATH)}
    print(json.dumps(result))


def load_cache():
    """Load pre-computed embeddings and metadata."""
    if not os.path.exists(EMBEDDINGS_PATH) or not os.path.exists(META_PATH):
        return None, None

    data = np.load(EMBEDDINGS_PATH)
    embeddings = data["embeddings"]

    with open(META_PATH, "r", encoding="utf-8") as f:
        meta = json.load(f)

    return embeddings, meta


import re

def split_text_to_fragments(text: str) -> list[str]:
    """Split long text into semantic fragments for better matching."""
    # Split on Korean particles, punctuation, conjunctions
    splitters = r'[,，.。\n;；!?！？·]|(?<=[\uAC00-\uD7A3])(?:이고|하고|이며|하며|에게|에서|으로|과|와|랑|이랑|에|가|은|는|도|의)(?=\s)'
    parts = re.split(splitters, text)
    fragments = [p.strip() for p in parts if p and p.strip()]
    return fragments if fragments else [text]


def recommend(texts: dict, top_k: int = 30, threshold: float = 0.25,
              exclude_categories: list[str] | None = None,
              auto_split: bool = True):
    """
    Given a dict of {reason: text}, find the most similar tags.
    Returns list of {tag, category, categoryLabel, color, reason, score}.
    
    exclude_categories: category IDs to filter out (e.g. ["artist"])
    auto_split: split long texts into fragments for better detail matching
    """
    if exclude_categories is None:
        exclude_categories = ["artist"]

    # Load cache
    tag_embeddings, tag_meta = load_cache()
    if tag_embeddings is None:
        print("Cache not found. Run --build-cache first.", file=sys.stderr)
        return []

    # Pre-filter: build mask for excluded categories
    excluded = set(exclude_categories)
    category_mask = np.array([m["category"] not in excluded for m in tag_meta])

    # Apply category filter to embeddings
    filtered_indices = np.where(category_mask)[0]
    filtered_embeddings = tag_embeddings[filtered_indices]
    filtered_meta = [tag_meta[i] for i in filtered_indices]

    # Pre-normalize tag embeddings once
    tag_norms = filtered_embeddings / np.linalg.norm(filtered_embeddings, axis=1, keepdims=True)

    # Load model
    model = get_model()

    # Collect all query fragments: (text, reason)
    query_pairs = []
    for reason, text in texts.items():
        if not text or not text.strip():
            continue
        if auto_split and len(text) >= 20:
            fragments = split_text_to_fragments(text)
            # Also include the full text for overall context
            query_pairs.append((text, reason))
            for frag in fragments:
                query_pairs.append((frag, reason))
        else:
            query_pairs.append((text, reason))

    if not query_pairs:
        return []

    # Batch encode all queries at once
    query_texts = [qp[0] for qp in query_pairs]
    query_embeddings = model.encode(query_texts, batch_size=32)
    query_embeddings = query_embeddings / np.linalg.norm(query_embeddings, axis=1, keepdims=True)

    # Compute similarities: (num_queries, num_tags)
    all_similarities = np.dot(query_embeddings, tag_norms.T)

    # Aggregate: for each tag, take the max score across all queries
    all_results = []
    seen = {}  # tag_key -> best result

    for qi, (_, reason) in enumerate(query_pairs):
        sims = all_similarities[qi]

        # Get top indices above threshold
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

    all_results = list(seen.values())
    all_results.sort(key=lambda x: -x["score"])
    return all_results[:top_k]


def main():
    parser = argparse.ArgumentParser(description="Embedding-based tag recommender")
    parser.add_argument("--build-cache", action="store_true",
                        help="Build/rebuild tag embedding cache")
    parser.add_argument("--text", type=str,
                        help="Single text to get recommendations for")
    parser.add_argument("--config", type=str,
                        help="JSON config file with texts and parameters")
    parser.add_argument("--top-k", type=int, default=30,
                        help="Number of top tags to return")
    parser.add_argument("--threshold", type=float, default=0.25,
                        help="Minimum similarity threshold")

    args = parser.parse_args()

    if args.build_cache:
        build_cache()
        return

    if args.text:
        results = recommend({"입력": args.text}, args.top_k, args.threshold,
                            exclude_categories=["artist"])
        print(json.dumps({"tags": results}, ensure_ascii=False, indent=2))
        return

    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            config = json.load(f)

        texts = config.get("texts", {})
        top_k = config.get("topK", args.top_k)
        threshold = config.get("threshold", args.threshold)
        exclude_cats = config.get("excludeCategories", ["artist"])
        auto_split = config.get("autoSplit", True)

        results = recommend(texts, top_k, threshold,
                            exclude_categories=exclude_cats,
                            auto_split=auto_split)
        print(json.dumps({"tags": results}, ensure_ascii=False, indent=2))
        return

    parser.print_help()


if __name__ == "__main__":
    main()
