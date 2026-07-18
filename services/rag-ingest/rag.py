"""
Lớp RAG: tìm và trích dẫn Điều/Khoản liên quan tới 1 câu hỏi/cảnh báo.

    cảnh báo / câu hỏi -> tìm Điều/Khoản liên quan -> trả nội dung quy định
    -> citation: văn bản, điều, khoản, trang

Hybrid retrieval = Dense (sentence-transformers, semantic) + BM25 (từ khóa,
lexical), hợp nhất bằng Reciprocal Rank Fusion (RRF). Lý do cần cả 2:
- Dense giỏi nắm ý nghĩa/paraphrase nhưng có thể xếp nhầm chunk trùng từ bề
  mặt lên cao hơn chunk đúng chủ đề (đã đo được: query "răng giả" từng rớt
  chunk đúng xuống hạng #77/847 dù chunk chứa nguyên văn "răng giả").
- BM25 giỏi bắt trùng khớp từ khóa chính xác (số Điều, thuật ngữ chuyên môn)
  nhưng không hiểu paraphrase/đồng nghĩa.
RRF hợp nhất bằng THỨ HẠNG (không phải điểm số thô) nên không cần chuẩn hóa
thang điểm khác nhau giữa cosine similarity và BM25 score - đây là lý do
chọn RRF thay vì cộng trọng số điểm số trực tiếp.
"""
import json
import os
import re

import numpy as np
from rank_bm25 import BM25Okapi

import config
from embedder import VECTOR_STORE_DIR

RRF_K = 60          # hằng số chuẩn trong RRF (Cormack et al. 2009), it nhạy với dữ liệu nhỏ
CANDIDATE_POOL = 60  # số ứng viên lấy từ MỖI retriever trước khi hợp nhất
# Lưu ý: pool=30 từng bỏ sót 1 chunk đúng có dense_rank=41/bm25_rank=5 - vì
# dense_rank vượt ngoài pool nên bị tính la 0 diem dense thay vi diem that
# (yeu). Tang len 60 de giam rui ro nay, danh doi bang chi phi tinh toan
# (van rat nho so voi ~1.5k chunk hien tai).

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


class ComplianceRAG:
    def __init__(self):
        manifest_path = os.path.join(VECTOR_STORE_DIR, "manifest.json")
        with open(manifest_path, encoding="utf-8") as f:
            self.manifest = json.load(f)

        self.embeddings = np.load(os.path.join(VECTOR_STORE_DIR, "embeddings.npy"))
        self.meta = []
        with open(os.path.join(VECTOR_STORE_DIR, "meta.jsonl"), encoding="utf-8") as f:
            for line in f:
                self.meta.append(json.loads(line))

        self._model = None
        self._vectorizer = None
        if self.manifest["method"] == "sentence-transformers":
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.manifest["model_name"])
        else:
            from sklearn.feature_extraction.text import TfidfVectorizer
            with open(os.path.join(VECTOR_STORE_DIR, "tfidf_vocab.json"), encoding="utf-8") as f:
                vocab = json.load(f)
            self._vectorizer = TfidfVectorizer(vocabulary=vocab, sublinear_tf=True)
            self._vectorizer.fit([""])  # cần fit để set idf_ nhưng đã có vocab cố định

        # BM25 index dựng tại chỗ từ chunk text - nhẹ, không cần lưu riêng
        tokenized_corpus = [_tokenize(row["text"]) for row in self.meta]
        self._bm25 = BM25Okapi(tokenized_corpus)

    def _embed_query(self, query: str) -> np.ndarray:
        if self._model is not None:
            v = self._model.encode([query], normalize_embeddings=True, convert_to_numpy=True)
            return v[0].astype("float32")
        v = self._vectorizer.transform([query]).toarray()[0].astype("float32")
        norm = np.linalg.norm(v)
        return v / norm if norm > 0 else v

    def _dense_ranking(self, query: str, pool: int):
        q = self._embed_query(query)
        scores = self.embeddings @ q  # cosine similarity (đã normalize)
        top_idx = np.argsort(-scores)[:pool]
        return top_idx, scores

    def _bm25_ranking(self, query: str, pool: int):
        scores = self._bm25.get_scores(_tokenize(query))
        top_idx = np.argsort(-scores)[:pool]
        return top_idx, scores

    def search(self, query: str, top_k: int = 5, pool: int = CANDIDATE_POOL):
        dense_idx, dense_scores = self._dense_ranking(query, pool)
        bm25_idx, bm25_scores = self._bm25_ranking(query, pool)

        dense_rank = {int(idx): r + 1 for r, idx in enumerate(dense_idx)}
        bm25_rank = {int(idx): r + 1 for r, idx in enumerate(bm25_idx)}

        candidates = set(dense_rank) | set(bm25_rank)
        rrf_scores = {}
        for idx in candidates:
            s = 0.0
            if idx in dense_rank:
                s += 1.0 / (RRF_K + dense_rank[idx])
            if idx in bm25_rank:
                s += 1.0 / (RRF_K + bm25_rank[idx])
            rrf_scores[idx] = s

        ranked = sorted(candidates, key=lambda i: -rrf_scores[i])[:top_k]

        results = []
        for idx in ranked:
            row = self.meta[idx]
            results.append({
                "score": rrf_scores[idx],
                "dense_score": float(dense_scores[idx]),
                "dense_rank": dense_rank.get(idx),
                "bm25_score": float(bm25_scores[idx]),
                "bm25_rank": bm25_rank.get(idx),
                "citation": row["citation"],
                "text": row["text"],
                "chunk_id": row["chunk_id"],
                "doc_id": row["doc_id"],
                "dieu_so": row["dieu_so"],
                "khoan_so": row["khoan_so"],
                "page_start": row["page_start"],
                "page_end": row["page_end"],
            })
        return results


def _cli_demo():
    rag = ComplianceRAG()
    demo_queries = [
        "Phải có sự đồng ý của người bệnh trước khi thực hiện thủ thuật không?",
        "Hồ sơ bệnh án thiếu thông tin thì xử lý thế nào?",
        "Quy định về dị ứng thuốc trước khi kê đơn",
        "Bảo hiểm y tế có chi trả cho răng giả không?",
    ]
    for q in demo_queries:
        print("\n" + "=" * 80)
        print("QUERY:", q)
        for r in rag.search(q, top_k=3):
            print(f"  [rrf={r['score']:.4f} dense_rank={r['dense_rank']} bm25_rank={r['bm25_rank']}] {r['citation']} (trang {r['page_start']}-{r['page_end']})")
            print(f"    {r['text'][:180].replace(chr(10), ' ')}...")


if __name__ == "__main__":
    _cli_demo()
