"""
Stage: Điều khoản pháp lý -> yêu cầu chuẩn hóa (requirements).

Input : output/clauses.jsonl
Output: requirements.csv

Dò từ khóa nghĩa vụ/cấm đoán trong tiếng Việt pháp lý (phải, có trách nhiệm,
không được, nghiêm cấm...) để rút ra DANH SÁCH ỨNG VIÊN yêu cầu tuân thủ.
Đây là bước hỗ trợ bán tự động: mọi dòng đều có review_status="pending_review"
vì việc xác nhận ý nghĩa pháp lý cuối cùng vẫn cần người (đội ngũ compliance)
duyệt trước khi đưa vào rules.json.
"""
import csv
import json
import os
import re

import config

RE_SENTENCE_SPLIT = re.compile(r"(?<=[\.;:])\s+")


def _find_keyword_sentences(text: str, keywords: list[str]):
    hits = []
    for sentence in RE_SENTENCE_SPLIT.split(text):
        s_lower = sentence.lower()
        for kw in keywords:
            if kw in s_lower:
                hits.append((kw, sentence.strip()))
                break
    return hits


def _guess_table_hints(text: str) -> str:
    text_lower = text.lower()
    hints = []
    for table, keywords in config.TABLE_KEYWORD_HINTS.items():
        if any(kw in text_lower for kw in keywords):
            hints.append(table)
    return ";".join(hints)


def clause_full_text(clause: dict) -> str:
    parts = [clause["text"]]
    for p in clause.get("diem", []):
        parts.append(f"{p['diem_so']}) {p['text']}")
    return "\n".join(parts).strip()


def run():
    clauses = []
    with open(os.path.join(config.OUTPUT_DIR, "clauses.jsonl"), encoding="utf-8") as f:
        for line in f:
            clauses.append(json.loads(line))

    doc_meta_by_id = {d["doc_id"]: d for d in config.DOCUMENTS}

    rows = []
    req_counter = 0
    for clause in clauses:
        full_text = clause_full_text(clause)
        if not full_text:
            continue

        found_must = _find_keyword_sentences(full_text, config.MUST_KEYWORDS)
        found_must_not = _find_keyword_sentences(full_text, config.MUST_NOT_KEYWORDS)
        found_cond = _find_keyword_sentences(full_text, config.CONDITIONAL_KEYWORDS)

        combined = (
            [("MUST", kw, s) for kw, s in found_must]
            + [("MUST_NOT", kw, s) for kw, s in found_must_not]
            + [("CONDITIONAL", kw, s) for kw, s in found_cond]
        )
        if not combined:
            continue

        doc_meta = doc_meta_by_id[clause["doc_id"]]
        seen_sentences = set()
        for obligation_type, keyword, sentence in combined:
            if sentence in seen_sentences:
                continue
            seen_sentences.add(sentence)
            req_counter += 1
            rows.append({
                "requirement_id": f"REQ{req_counter:04d}",
                "clause_id": clause["clause_id"],
                "doc_id": clause["doc_id"],
                "so_hieu": doc_meta["so_hieu"],
                "dieu_so": clause["dieu_so"],
                "khoan_so": clause.get("khoan_so") or "",
                "obligation_type": obligation_type,
                "keyword_matched": keyword,
                "requirement_text": sentence,
                "suggested_tables": _guess_table_hints(sentence),
                "page_start": clause["page_start"],
                "page_end": clause["page_end"],
                "review_status": "pending_review",
            })

    out_path = os.path.join(config.OUTPUT_DIR, "requirements.csv")
    fieldnames = list(rows[0].keys()) if rows else [
        "requirement_id", "clause_id", "doc_id", "so_hieu", "dieu_so", "khoan_so",
        "obligation_type", "keyword_matched", "requirement_text", "suggested_tables",
        "page_start", "page_end", "review_status",
    ]
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[requirements] {len(clauses)} clauses -> {len(rows)} requirement candidates")
    print(f"[requirements] wrote {out_path}")
    return rows


if __name__ == "__main__":
    run()
