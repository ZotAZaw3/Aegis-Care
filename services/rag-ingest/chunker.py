"""
Stage: Chunk theo cấu trúc + Gắn metadata nguồn.

Input : output/clauses.jsonl (+ metadata văn bản trong config.DOCUMENTS)
Output: chunks.jsonl

Nguyên tắc: đơn vị chunk mặc định là 1 KHOẢN (clause) - đây là đơn vị pháp lý
nhỏ nhất có thể trích dẫn độc lập ("căn cứ khoản X Điều Y"). Nếu 1 khoản dài
hơn MAX_CHUNK_CHARS (khoản có nhiều điểm a, b, c... dài) thì cắt tiếp theo
ranh giới điểm/câu, có overlap để không mất ngữ cảnh ở ranh giới.
"""
import json
import os

import config

DOC_META_BY_ID = {d["doc_id"]: d for d in config.DOCUMENTS}


def clause_full_text(clause: dict) -> str:
    parts = [clause["text"]]
    for p in clause.get("diem", []):
        parts.append(f"{p['diem_so']}) {p['text']}")
    return "\n".join(parts).strip()


def split_long_text(text: str, max_chars: int, overlap: int):
    if len(text) <= max_chars:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        # cố gắng cắt tại ranh giới dòng/câu gần nhất thay vì cắt giữa từ
        if end < len(text):
            cut = text.rfind("\n", start, end)
            if cut == -1 or cut <= start + max_chars // 2:
                cut = text.rfind(". ", start, end)
            if cut != -1 and cut > start + max_chars // 2:
                end = cut + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


def build_citation(doc_meta, clause):
    parts = [doc_meta["ten_van_ban"], f"số {doc_meta['so_hieu']}"]
    if clause.get("is_page_fallback"):
        # Tai lieu khong co cau truc Chuong-Dieu-Khoan (mau bieu/bang phuc tap)
        # -> chi trich dan duoc theo so trang.
        return ", ".join(parts) + f" - Trang {clause['page_start']}"
    loc = []
    if clause.get("chuong_so"):
        loc.append(f"Chương {clause['chuong_so']}")
    if clause.get("muc_so"):
        loc.append(f"Mục {clause['muc_so']}")
    loc.append(f"Điều {clause['dieu_so']}")
    if clause.get("khoan_so"):
        loc.append(f"Khoản {clause['khoan_so']}")
    citation = ", ".join(parts) + " - " + ", ".join(loc)
    if clause.get("amendment_ref"):
        # Khoan nay trich dan nguyen van noi dung sua doi cua 1 Dieu/Khoan
        # KHAC (thuong thuoc luat goc, khong nam trong bo tai lieu) - can neu
        # ro de nguoi doc/LLM biet phai doi chieu dung ngu canh cua Dieu do.
        citation += f" (nội dung sửa đổi {clause['amendment_ref']} của văn bản gốc)"
    return citation


def run():
    clauses = []
    with open(os.path.join(config.OUTPUT_DIR, "clauses.jsonl"), encoding="utf-8") as f:
        for line in f:
            clauses.append(json.loads(line))

    chunks = []
    for clause in clauses:
        doc_meta = DOC_META_BY_ID[clause["doc_id"]]
        full_text = clause_full_text(clause)
        if not full_text:
            continue
        pieces = split_long_text(full_text, config.MAX_CHUNK_CHARS, config.CHUNK_OVERLAP_CHARS)
        for i, piece in enumerate(pieces):
            chunk_id = clause["clause_id"] if len(pieces) == 1 else f"{clause['clause_id']}__part{i+1}"
            chunks.append({
                "chunk_id": chunk_id,
                "doc_id": clause["doc_id"],
                "van_ban_ten": doc_meta["ten_van_ban"],
                "so_hieu": doc_meta["so_hieu"],
                "loai_van_ban": doc_meta["loai_van_ban"],
                "co_quan_ban_hanh": doc_meta["co_quan_ban_hanh"],
                "ngay_hieu_luc": doc_meta["ngay_hieu_luc"],
                "chuong_so": clause.get("chuong_so"),
                "muc_so": clause.get("muc_so"),
                "dieu_so": clause["dieu_so"],
                "dieu_ten": clause["dieu_ten"],
                "khoan_so": clause.get("khoan_so"),
                "clause_id": clause["clause_id"],
                "chunk_part": i + 1,
                "chunk_parts_total": len(pieces),
                "text": piece,
                "char_count": len(piece),
                "page_start": clause["page_start"],
                "page_end": clause["page_end"],
                "citation": build_citation(doc_meta, clause),
            })

    out_path = os.path.join(config.OUTPUT_DIR, "chunks.jsonl")
    with open(out_path, "w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    print(f"[chunk] {len(clauses)} clauses -> {len(chunks)} chunks")
    print(f"[chunk] wrote {out_path}")
    return chunks


if __name__ == "__main__":
    run()
