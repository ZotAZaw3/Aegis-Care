"""
Chạy toàn bộ Pipeline 1 - Compliance Knowledge Pipeline theo đúng thứ tự:

PDF -> ingest/extract theo trang -> preprocessing -> parse Chuong-Muc-Dieu-
Khoan-Diem -> tao clauses/articles -> chunk theo cau truc -> gan metadata ->
embedding -> vector store -> (lop RAG) + (requirements -> rules -> mapping)

Usage: python run_pipeline.py
"""
import time

import chunker
import embedder
import pdf_extract
import requirements_extractor
import rules_builder
import structure_parser


def main():
    t0 = time.time()

    print("\n===== [1/6] Ingest + Extract text theo trang + Preprocessing =====")
    pdf_extract.run()

    print("\n===== [2/6] Parse Chuong-Muc-Dieu-Khoan-Diem =====")
    structure_parser.run()

    print("\n===== [3/6] Chunk theo cau truc + gan metadata =====")
    chunker.run()

    print("\n===== [4/6] Embedding + Vector Store (lop RAG) =====")
    embedder.build_vector_store()

    print("\n===== [5/6] Requirements (yeu cau chuan hoa) =====")
    requirements_extractor.run()

    print("\n===== [6/6] Structured Rules + evidence mapping =====")
    rules_builder.build_rules()

    print(f"\n===== HOAN TAT trong {time.time() - t0:.1f}s =====")
    print("Output: pipeline1_compliance/output/")
    print("  - document_manifest.csv")
    print("  - clean_pages.jsonl")
    print("  - articles.jsonl")
    print("  - clauses.jsonl")
    print("  - chunks.jsonl")
    print("  - vector_store/ (embeddings.npy, meta.jsonl, manifest.json)")
    print("  - requirements.csv")
    print("  - rules.json")
    print("  - rule_evidence_mapping.csv")


if __name__ == "__main__":
    main()
