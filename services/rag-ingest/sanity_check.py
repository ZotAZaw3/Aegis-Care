"""
Kiem tra toan ven du lieu xuyen suot pipeline (tu dong hoa phan "may moc" cua
viec test - khong thay the viec doc mau bang mat de danh gia chat luong ngu
nghia, chi bat loi cau truc/thieu du lieu/lech so lieu giua cac buoc).

Chay: python sanity_check.py
"""
import json
import os

import config

OUT = config.OUTPUT_DIR
CHECKS = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    CHECKS.append((status, name, detail))
    print(f"[{status}] {name}" + (f" - {detail}" if detail else ""))


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def main():
    import csv

    # ---- 1. document_manifest.csv ----
    manifest_path = os.path.join(OUT, "document_manifest.csv")
    with open(manifest_path, encoding="utf-8-sig") as f:
        manifest_rows = list(csv.DictReader(f))
    check("document_manifest.csv co du van ban theo config.DOCUMENTS",
          len(manifest_rows) == len(config.DOCUMENTS),
          f"tim thay {len(manifest_rows)}, ky vong {len(config.DOCUMENTS)}")
    bad_status = [r["doc_id"] for r in manifest_rows if r["status"] != "ok"]
    check("Tat ca van ban extract status=ok", not bad_status, f"loi: {bad_status}")
    for r in manifest_rows:
        n_pages, n_empty = int(r["so_trang"]), int(r["trang_trong_rong"])
        empty_ratio = n_empty / max(n_pages, 1)
        # tai lieu it trang (mau bieu ngan) thi 1 trang trang cuoi (chu ky/de
        # trong) la binh thuong - chi bao dong khi so trang trong TUYET DOI
        # dang ke (>2) hoac ty le cao VOI tai lieu du dai (>=10 trang)
        if (n_pages < 10 and n_empty > 1) or (n_pages >= 10 and empty_ratio > 0.10):
            check(f"  {r['doc_id']}: ty le trang rong thap", False,
                  f"{n_empty}/{n_pages} trang rong")
        elif n_empty > 0:
            print(f"[INFO]   {r['doc_id']}: {n_empty}/{n_pages} trang rong "
                  f"- kiem tra thu xem co nam trong phu luc/bang dang anh/trang cuoi khong (thuong la binh thuong)")

    # ---- 2. clean_pages.jsonl khop tong so trang ----
    pages = load_jsonl(os.path.join(OUT, "clean_pages.jsonl"))
    expected_pages = sum(int(r["so_trang"]) for r in manifest_rows)
    check("clean_pages.jsonl khop tong so trang trong manifest",
          len(pages) == expected_pages, f"{len(pages)} vs {expected_pages}")

    # ---- 3. articles.jsonl: khong Dieu trung lap trong cung 1 doc ----
    articles = load_jsonl(os.path.join(OUT, "articles.jsonl"))
    seen = set()
    dup = []
    for a in articles:
        key = (a["doc_id"], a["dieu_so"])
        if key in seen:
            dup.append(key)
        seen.add(key)
    check("Khong co Dieu bi trung lap (dedup hoat dong dung)", not dup, f"trung: {dup}")

    article_ids = {a["dieu_id"] for a in articles}

    # ---- 4. clauses.jsonl: moi clause phai tro toi 1 dieu co that ----
    clauses = load_jsonl(os.path.join(OUT, "clauses.jsonl"))
    orphan_clauses = [c["clause_id"] for c in clauses if c["dieu_id"] not in article_ids]
    check("Moi clause deu tro ve 1 Dieu ton tai (referential integrity)",
          not orphan_clauses, f"{len(orphan_clauses)} clause mo coi")
    clause_ids = {c["clause_id"] for c in clauses}

    # ---- 5. chunks.jsonl: moi chunk tro ve 1 clause co that + do dai hop ly ----
    chunks = load_jsonl(os.path.join(OUT, "chunks.jsonl"))
    orphan_chunks = [c["chunk_id"] for c in chunks if c["clause_id"] not in clause_ids]
    check("Moi chunk deu tro ve 1 clause ton tai", not orphan_chunks,
          f"{len(orphan_chunks)} chunk mo coi")
    oversize = [c["chunk_id"] for c in chunks
                if c["char_count"] > config.MAX_CHUNK_CHARS + config.CHUNK_OVERLAP_CHARS]
    check("Khong chunk nao vuot qua nguong kich thuoc cho phep", not oversize,
          f"{len(oversize)} chunk qua dai")
    empty_citation = [c["chunk_id"] for c in chunks if not c.get("citation")]
    check("Moi chunk co citation", not empty_citation, f"{len(empty_citation)} thieu citation")

    # ---- 6. vector_store: so luong khop giua embeddings/meta/chunks ----
    vs_dir = os.path.join(OUT, "vector_store")
    with open(os.path.join(vs_dir, "manifest.json"), encoding="utf-8") as f:
        vs_manifest = json.load(f)
    meta = load_jsonl(os.path.join(vs_dir, "meta.jsonl"))
    import numpy as np
    emb = np.load(os.path.join(vs_dir, "embeddings.npy"))
    check("vector_store: n_chunks khop chunks.jsonl", vs_manifest["n_chunks"] == len(chunks),
          f"{vs_manifest['n_chunks']} vs {len(chunks)}")
    check("vector_store: embeddings.npy so dong khop meta.jsonl", emb.shape[0] == len(meta),
          f"{emb.shape[0]} vs {len(meta)}")
    check("vector_store: dung sentence-transformers (khong fallback TF-IDF)",
          vs_manifest["method"] == "sentence-transformers", f"method={vs_manifest['method']}")

    # ---- 7. requirements.csv: moi requirement tro ve 1 clause co that ----
    with open(os.path.join(OUT, "requirements.csv"), encoding="utf-8-sig") as f:
        requirements = list(csv.DictReader(f))
    orphan_req = [r["requirement_id"] for r in requirements if r["clause_id"] not in clause_ids]
    check("Moi requirement deu tro ve 1 clause ton tai", not orphan_req,
          f"{len(orphan_req)} requirement mo coi")

    # ---- 8. rules.json + rule_evidence_mapping.csv ----
    with open(os.path.join(OUT, "rules.json"), encoding="utf-8") as f:
        rules = json.load(f)
    req_ids = {r["requirement_id"] for r in requirements}
    orphan_rules = [r["rule_id"] for r in rules
                    if r["requirement_id"] is not None and r["requirement_id"] not in req_ids]
    check("Moi rule (tru seed example) deu tro ve 1 requirement ton tai",
          not orphan_rules, f"{len(orphan_rules)} rule mo coi")
    no_status = [r["rule_id"] for r in rules if "status" not in r]
    check("Moi rule co field status (de biet draft hay verified)", not no_status)

    with open(os.path.join(OUT, "rule_evidence_mapping.csv"), encoding="utf-8-sig") as f:
        mapping_rows = list(csv.DictReader(f))
    rule_ids_from_json = {r["rule_id"] for r in rules}
    orphan_mapping = [m["rule_id"] for m in mapping_rows if m["rule_id"] not in rule_ids_from_json]
    check("Moi dong rule_evidence_mapping tro ve 1 rule ton tai trong rules.json",
          not orphan_mapping, f"{len(orphan_mapping)} dong mo coi")

    # ---- Tong ket ----
    n_fail = sum(1 for s, _, _ in CHECKS if s == "FAIL")
    print(f"\n===== {len(CHECKS) - n_fail}/{len(CHECKS)} PASS, {n_fail} FAIL =====")
    return n_fail == 0


if __name__ == "__main__":
    ok = main()
    raise SystemExit(0 if ok else 1)
