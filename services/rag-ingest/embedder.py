"""
Stage: Embedding + Vector Store (lớp RAG).

Input : output/chunks.jsonl
Output: output/vector_store/  (embeddings.npy + meta.jsonl + manifest.json)

Ưu tiên sentence-transformers (multilingual, chạy local - không cần API key
khi demo). Nếu không có sentence-transformers, tự động fallback sang TF-IDF
(scikit-learn) để pipeline vẫn chạy được end-to-end.
"""
import json
import os

import numpy as np

import config

VECTOR_STORE_DIR = os.path.join(config.OUTPUT_DIR, "vector_store")


def _load_chunks():
    chunks = []
    with open(os.path.join(config.OUTPUT_DIR, "chunks.jsonl"), encoding="utf-8") as f:
        for line in f:
            chunks.append(json.loads(line))
    return chunks


def _embed_with_sentence_transformers(texts):
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(config.EMBEDDING_MODEL)
    embeddings = model.encode(
        texts, batch_size=32, show_progress_bar=True,
        normalize_embeddings=True, convert_to_numpy=True,
    )
    return embeddings.astype("float32"), "sentence-transformers", config.EMBEDDING_MODEL


def _embed_with_tfidf(texts):
    from sklearn.feature_extraction.text import TfidfVectorizer
    vectorizer = TfidfVectorizer(max_features=config.EMBEDDING_DIM_FALLBACK, sublinear_tf=True)
    matrix = vectorizer.fit_transform(texts).toarray().astype("float32")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    matrix = matrix / norms
    vocab_path = os.path.join(VECTOR_STORE_DIR, "tfidf_vocab.json")
    os.makedirs(VECTOR_STORE_DIR, exist_ok=True)
    with open(vocab_path, "w", encoding="utf-8") as f:
        json.dump(vectorizer.vocabulary_, f, ensure_ascii=False)
    return matrix, "tfidf", "sklearn.TfidfVectorizer"


def build_vector_store():
    chunks = _load_chunks()
    texts = [c["text"] for c in chunks]

    try:
        embeddings, method, model_name = _embed_with_sentence_transformers(texts)
    except Exception as e:
        print(f"[embed] sentence-transformers khong dung duoc ({e}); fallback sang TF-IDF")
        embeddings, method, model_name = _embed_with_tfidf(texts)

    os.makedirs(VECTOR_STORE_DIR, exist_ok=True)
    np.save(os.path.join(VECTOR_STORE_DIR, "embeddings.npy"), embeddings)

    meta_path = os.path.join(VECTOR_STORE_DIR, "meta.jsonl")
    with open(meta_path, "w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    manifest = {
        "method": method,
        "model_name": model_name,
        "n_chunks": len(chunks),
        "embedding_dim": int(embeddings.shape[1]) if len(embeddings) else 0,
    }
    with open(os.path.join(VECTOR_STORE_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"[embed] method={method} model={model_name} n_chunks={len(chunks)} dim={manifest['embedding_dim']}")
    print(f"[embed] wrote {VECTOR_STORE_DIR}")
    return manifest


if __name__ == "__main__":
    build_vector_store()
