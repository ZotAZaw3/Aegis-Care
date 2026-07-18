"""
Stage 3-4: Parse Chương-Mục-Điều-Khoản-Điểm; tạo clauses và articles.

Input : output/clean_pages.jsonl
Output: articles.jsonl, clauses.jsonl

Thiết kế: parser chạy THEO TỪNG DÒNG (không dựa vào dòng trống phân đoạn),
vì một số trang trong PDF nguồn không có dòng trống ngăn cách giữa các Điều/
Khoản (layout khít) — nếu tách theo block sẽ bỏ sót các Điều nằm liền dòng
với Điều/Khoản trước đó. Mọi header cấu trúc (Chương/Mục/Điều/Khoản/Điểm)
đều bắt đầu ở đầu một dòng theo quy ước văn bản pháp luật Việt Nam, nên dùng
mốc này để phân đoạn là đáng tin cậy bất kể có dòng trống hay không.

Chỉ parse cấu trúc trong phần NỘI DUNG CHÍNH. Phần chữ ký / "Nơi nhận" /
phụ lục biểu mẫu phía sau được giữ nguyên ở dạng trang gốc (clean_pages.jsonl)
và không bị ép vào cấu trúc khoản giả — vì mẫu biểu không phải "khoản" pháp lý.
"""
import json
import os
import re
from collections import defaultdict

import config

RE_CHUONG = re.compile(r"^Chương\s+([IVXLCDM]+)\b\.?\s*(.*)$")
RE_MUC = re.compile(r"^Mục\s+(\d+|[IVXLCDM]+)\b\.?\s*(.*)$")
RE_DIEU = re.compile(r"^Điều\s+(\d+)\.\s*(.*)$")
RE_KHOAN = re.compile(r"^(\d{1,3})\.\s+(.+)$")
RE_DIEM = re.compile(r"^([a-zđ])\)\s+(.+)$")
RE_TRAILER = re.compile(r"^Nơi nhận\s*:?")

# Van ban "luat sua doi, bo sung": 1 khoan cua Dieu hien tai co the trich dan
# NGUYEN VAN noi dung sua doi cua 1 Dieu/Khoan khac (thuong cua luat GOC,
# khong nam trong bo tai lieu) trong ngoac kep, VD:
#   "18. Sua doi, bo sung khoan 7 va khoan 8 Dieu 23 nhu sau:
#   "7. ...
#   8. Su dung thiet bi y te thay the bao gom ... rang gia ..."."
# Neu parse phang, dong "7."/"8." se bi hieu nham la khoan MOI cua Dieu hien
# tai (mat cau dan "Dieu 23"), lam mat ngu canh quan trong (Dieu 23 la "cac
# truong hop KHONG duoc huong BHYT" trong luat goc) va co the khien LLM doan
# sai chieu. RE_AMENDMENT_REF phat hien dong dan nay de tam ngung nhan dien
# Dieu/Khoan/Diem MOI cho toi khi ngoac kep dong lai, giu nguyen toan bo noi
# dung trich dan la 1 khoi thuoc VE khoan dang mo (vd Khoan 18), khong tach
# thanh cac khoan gia.
RE_AMENDMENT_REF = re.compile(r"(?:Sửa đổi|Bổ sung)[^\n]*?(Điều\s+\d+)[^\n]*?như sau\s*:?\s*$")
QUOTE_CHARS = '"“”'
MAX_QUOTED_AMENDMENT_LINES = 30  # phanh an toan neu khong tim thay dau dong ngoac


def iter_lines(pages):
    """Sinh (page_num, line_text) cho toàn bộ dòng của 1 văn bản, theo đúng thứ tự trang."""
    for page in pages:
        text = page["text"]
        if not text:
            continue
        for line in text.split("\n"):
            yield page["page_num"], line.rstrip()


def classify(line, trailer_started, has_dieu, has_khoan):
    stripped = line.strip()
    if not stripped:
        return "blank", None

    if RE_TRAILER.match(stripped):
        return "trailer", None
    if trailer_started:
        return "trailer", None

    m = RE_CHUONG.match(stripped)
    if m:
        return "chuong", m
    m = RE_MUC.match(stripped)
    if m:
        return "muc", m
    m = RE_DIEU.match(stripped)
    if m:
        return "dieu", m
    m = RE_KHOAN.match(stripped)
    if m and has_dieu:
        return "khoan", m
    m = RE_DIEM.match(stripped)
    if m and (has_khoan or has_dieu):
        return "diem", m
    return "continuation", stripped


def _join(lines):
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_document(doc_id, pages):
    chuong_ctx = {"so": None, "ten": None}
    muc_ctx = {"so": None, "ten": None}
    dieu_ctx = None
    khoan_ctx = None

    articles = []
    clauses = []
    preamble_lines = []
    trailer_lines = []

    current = None  # {"type", "lines": [...], "page_start", "page_end", "match"}
    trailer_started = False
    occurrence_seen = {}  # dieu_so -> số lần đã gặp (để tách 2 bản Điều bị lặp trong PDF nguồn)

    def flush():
        nonlocal dieu_ctx, khoan_ctx
        if current is None:
            return
        btype = current["type"]
        text = _join(current["lines"])

        if btype == "chuong":
            num = current["match"].group(1)
            chuong_ctx["so"] = num
            chuong_ctx["ten"] = text
            muc_ctx["so"], muc_ctx["ten"] = None, None
            dieu_ctx, khoan_ctx = None, None
        elif btype == "muc":
            num = current["match"].group(1)
            muc_ctx["so"] = num
            muc_ctx["ten"] = text
            dieu_ctx, khoan_ctx = None, None
        elif btype == "dieu":
            num = current["match"].group(1)
            full_title_line = current["match"].group(2).strip()
            body_lines = current["lines"][1:] if len(current["lines"]) > 1 else []
            body_extra = _join(body_lines)
            occ = occurrence_seen.get(num, 0)
            occurrence_seen[num] = occ + 1
            article = {
                "_occ": occ,
                "dieu_id": f"{doc_id}__D{num}",
                "doc_id": doc_id,
                "chuong_so": chuong_ctx["so"],
                "chuong_ten": chuong_ctx["ten"],
                "muc_so": muc_ctx["so"],
                "muc_ten": muc_ctx["ten"],
                "dieu_so": num,
                "dieu_ten": full_title_line,
                "preamble_text": body_extra,
                "text": (f"Điều {num}. {full_title_line}\n\n{body_extra}").strip(),
                "page_start": current["page_start"],
                "page_end": current["page_end"],
                "n_khoan": 0,
            }
            articles.append(article)
            dieu_ctx = article
            khoan_ctx = None
        elif btype == "khoan":
            num = current["match"].group(1)
            full_text = text
            clause = {
                "_occ": dieu_ctx["_occ"],
                "clause_id": f"{doc_id}__D{dieu_ctx['dieu_so']}__K{num}",
                "doc_id": doc_id,
                "dieu_id": dieu_ctx["dieu_id"],
                "dieu_so": dieu_ctx["dieu_so"],
                "dieu_ten": dieu_ctx["dieu_ten"],
                "chuong_so": dieu_ctx["chuong_so"],
                "muc_so": dieu_ctx["muc_so"],
                "khoan_so": num,
                "text": full_text,
                "diem": [],
                "page_start": current["page_start"],
                "page_end": current["page_end"],
                "amendment_ref": current.get("amendment_ref"),
            }
            clauses.append(clause)
            dieu_ctx["n_khoan"] += 1
            khoan_ctx = clause
        elif btype == "diem":
            letter = current["match"].group(1)
            point = {"diem_so": letter, "text": text,
                     "page_start": current["page_start"], "page_end": current["page_end"]}
            if khoan_ctx is not None:
                khoan_ctx["diem"].append(point)
            elif dieu_ctx is not None:
                dieu_ctx.setdefault("diem_truc_tiep", []).append(point)
        elif btype == "trailer":
            trailer_lines.append(text)

    in_quoted_amendment = False
    quote_marks_seen = 0
    quoted_amendment_lines = 0

    for page_num, line in iter_lines(pages):
        pending_type = current["type"] if current is not None else None
        if pending_type in ("chuong", "muc", "trailer"):
            has_dieu, has_khoan = False, False
        elif pending_type == "dieu":
            has_dieu, has_khoan = True, False
        elif pending_type == "khoan":
            has_dieu, has_khoan = True, True
        else:  # None hoặc "diem" -> giữ nguyên ngữ cảnh Điều/Khoản đã chốt
            has_dieu = dieu_ctx is not None
            has_khoan = khoan_ctx is not None

        btype, payload = classify(line, trailer_started, has_dieu, has_khoan)

        if in_quoted_amendment and btype not in ("blank", "trailer"):
            # Dang trong ngoac kep trich dan sua doi Dieu/Khoan khac -> khong
            # cho phep nhan dien Chuong/Muc/Dieu/Khoan/Diem MOI, coi la tiep
            # noi cua khoan dang mo (giu nguyen ca cau dan "Dieu N nhu sau:").
            btype, payload = "continuation", line.strip()

        if btype == "blank":
            if current is not None:
                current["lines"].append("")
            continue

        if btype == "continuation":
            if current is None:
                if payload:
                    preamble_lines.append(payload)
                continue
            current["lines"].append(payload)
            current["page_end"] = page_num
            if in_quoted_amendment:
                quoted_amendment_lines += 1
                quote_marks_seen += sum(1 for ch in line if ch in QUOTE_CHARS)
                if quote_marks_seen >= 2 or quoted_amendment_lines >= MAX_QUOTED_AMENDMENT_LINES:
                    in_quoted_amendment = False
                    quote_marks_seen = 0
                    quoted_amendment_lines = 0
            continue

        # header mới (chuong/muc/dieu/khoan/diem/trailer) -> flush cái đang mở trước
        flush()

        if btype == "trailer":
            trailer_started = True
            current = {"type": "trailer", "lines": [line.strip()],
                       "page_start": page_num, "page_end": page_num, "match": None}
            continue

        first_content = payload.group(2).strip() if payload.groups() and len(payload.groups()) >= 2 else ""
        current = {
            "type": btype,
            "lines": [first_content] if first_content else [],
            "page_start": page_num, "page_end": page_num, "match": payload,
        }

        if btype == "khoan":
            m_amend = RE_AMENDMENT_REF.search(first_content)
            if m_amend:
                current["amendment_ref"] = m_amend.group(1)
                in_quoted_amendment = True
                quote_marks_seen = 0
                quoted_amendment_lines = 0

    flush()

    khoan_covered_dieu_ids = {c["dieu_id"] for c in clauses}
    for art in articles:
        if art["dieu_id"] not in khoan_covered_dieu_ids and art["preamble_text"]:
            clauses.append({
                "_occ": art["_occ"],
                "clause_id": f"{art['dieu_id']}__WHOLE",
                "doc_id": doc_id,
                "dieu_id": art["dieu_id"],
                "dieu_so": art["dieu_so"],
                "dieu_ten": art["dieu_ten"],
                "chuong_so": art["chuong_so"],
                "muc_so": art["muc_so"],
                "khoan_so": None,
                "text": art["preamble_text"],
                "diem": art.get("diem_truc_tiep", []),
                "page_start": art["page_start"],
                "page_end": art["page_end"],
            })

    for art in articles:
        art.pop("diem_truc_tiep", None)

    articles, clauses, n_dropped = _dedupe_repeated_dieu(articles, clauses)
    if n_dropped:
        print(f"[parse] {doc_id}: phat hien noi dung Dieu lap lai trong PDF nguon"
              f" - da bo {n_dropped} ban sao (giu ban xuat hien truoc)")

    if not articles:
        # Tai lieu khong theo cau truc Chuong-Muc-Dieu-Khoan-Diem (VD: mau bien
        # ban/bang bieu, hoac bang co layout dang cot/bang phuc tap khien
        # pdftotext khong tuyen tinh hoa duoc thanh dong ro rang). Fallback:
        # coi moi TRANG la 1 "dieu ao" de van con tim kiem duoc qua RAG, chi
        # mat do chi tiet trich dan (con "trang X" thay vi "Dieu X Khoan Y").
        articles, clauses = _fallback_page_level(doc_id, pages)
        print(f"[parse] {doc_id}: khong co cau truc Dieu -> fallback theo trang "
              f"({len(articles)} trang co noi dung)")

    return articles, clauses, "\n".join(preamble_lines), "\n".join(trailer_lines)


def _fallback_page_level(doc_id, pages):
    articles, clauses = [], []
    for page in pages:
        text = page["text"].strip()
        if not text:
            continue
        page_num = page["page_num"]
        first_line = text.split("\n", 1)[0].strip()[:120]
        dieu_so = f"P{page_num}"
        article = {
            "dieu_id": f"{doc_id}__{dieu_so}",
            "doc_id": doc_id,
            "chuong_so": None, "chuong_ten": None, "muc_so": None, "muc_ten": None,
            "dieu_so": dieu_so, "dieu_ten": first_line, "preamble_text": text, "text": text,
            "page_start": page_num, "page_end": page_num, "n_khoan": 0,
            "is_page_fallback": True,
        }
        articles.append(article)
        clauses.append({
            "clause_id": f"{doc_id}__{dieu_so}__WHOLE",
            "doc_id": doc_id,
            "dieu_id": article["dieu_id"], "dieu_so": dieu_so, "dieu_ten": first_line,
            "chuong_so": None, "muc_so": None, "khoan_so": None,
            "text": text, "diem": [],
            "page_start": page_num, "page_end": page_num,
            "is_page_fallback": True,
        })
    return articles, clauses


def _dedupe_repeated_dieu(articles, clauses):
    """Một vài PDF nguồn (ví dụ TT_12_2026_BTC) chứa nguyên văn 1 Điều bị lặp lại
    2 lần (lỗi từ nguồn/khi xuất PDF). dieu_id được sinh từ dieu_so nên 2 bản lặp
    có CÙNG dieu_id -> không thể lọc theo dieu_id. Dùng nhãn "_occ" (thứ tự xuất
    hiện, gắn khi parse) để tách: giữ bản _occ=0 (xuất hiện đầu tiên) cho mỗi
    dieu_so, bỏ các bản _occ>=1."""
    kept_articles = [a for a in articles if a["_occ"] == 0]
    dropped = len(articles) - len(kept_articles)
    kept_clauses = [c for c in clauses if c["_occ"] == 0]

    for a in kept_articles:
        a.pop("_occ", None)
    for c in kept_clauses:
        c.pop("_occ", None)

    kept_articles.sort(key=lambda a: (a["page_start"], int(a["dieu_so"])))
    return kept_articles, kept_clauses, dropped


def run():
    pages_by_doc = defaultdict(list)
    with open(os.path.join(config.OUTPUT_DIR, "clean_pages.jsonl"), encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            pages_by_doc[row["doc_id"]].append(row)

    all_articles, all_clauses = [], []
    for doc in config.DOCUMENTS:
        doc_id = doc["doc_id"]
        pages = sorted(pages_by_doc.get(doc_id, []), key=lambda p: p["page_num"])
        articles, clauses, preamble, trailer = parse_document(doc_id, pages)
        all_articles.extend(articles)
        all_clauses.extend(clauses)
        print(f"[parse] {doc_id}: {len(articles)} dieu, {len(clauses)} khoan/clause")

    articles_path = os.path.join(config.OUTPUT_DIR, "articles.jsonl")
    with open(articles_path, "w", encoding="utf-8") as f:
        for a in all_articles:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")

    clauses_path = os.path.join(config.OUTPUT_DIR, "clauses.jsonl")
    with open(clauses_path, "w", encoding="utf-8") as f:
        for c in all_clauses:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    print(f"[parse] wrote {articles_path} ({len(all_articles)} rows)")
    print(f"[parse] wrote {clauses_path} ({len(all_clauses)} rows)")
    return all_articles, all_clauses


if __name__ == "__main__":
    run()
