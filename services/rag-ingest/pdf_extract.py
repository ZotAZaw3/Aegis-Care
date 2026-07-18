"""
Stage 1-2: Ingest + Extract text theo trang + Preprocessing.

Input : PDF quy định / guideline / SOP (config.DOCUMENTS)
Output: document_manifest.csv, clean_pages.jsonl
"""
import csv
import json
import os
import re
import subprocess

from pypdf import PdfReader

import config


def _pdftotext_page(pdf_path: str, page_num: int) -> str:
    """Trích xuất text 1 trang bằng poppler pdftotext (giữ dấu tiếng Việt, giữ layout)."""
    result = subprocess.run(
        [
            "pdftotext", "-enc", "UTF-8", "-layout",
            "-f", str(page_num), "-l", str(page_num),
            pdf_path, "-",
        ],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return result.stdout


def clean_page_text(raw: str) -> str:
    """Preprocessing: chuẩn hóa whitespace, bỏ trang trắng, giữ ranh giới dòng có ý nghĩa cấu trúc."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    # Bỏ số trang / header lặp kiểu "- 3 -" hoặc số đứng riêng 1 dòng
    lines = []
    for line in text.split("\n"):
        stripped = line.strip()
        if re.fullmatch(r"-?\s*\d{1,4}\s*-?", stripped):
            continue
        lines.append(line.rstrip())
    text = "\n".join(lines)
    # Gộp nhiều dòng trống liên tiếp thành 1
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Gộp khoảng trắng thừa trong 1 dòng (nhưng giữ xuống dòng)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def get_page_count(pdf_path: str) -> int:
    try:
        return len(PdfReader(pdf_path).pages)
    except Exception:
        # fallback: hỏi pdfinfo
        result = subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True)
        m = re.search(r"Pages:\s*(\d+)", result.stdout)
        return int(m.group(1)) if m else 0


def extract_document(doc_meta: dict) -> dict:
    pdf_path = os.path.join(config.PDF_DIR, doc_meta["file_name"])
    n_pages = get_page_count(pdf_path)
    pages = []
    empty_pages = 0
    for page_num in range(1, n_pages + 1):
        raw = _pdftotext_page(pdf_path, page_num)
        clean = clean_page_text(raw)
        if not clean:
            empty_pages += 1
        pages.append({
            "doc_id": doc_meta["doc_id"],
            "page_num": page_num,
            "raw_char_count": len(raw),
            "clean_char_count": len(clean),
            "text": clean,
        })
    manifest_row = {
        **doc_meta,
        "file_size_bytes": os.path.getsize(pdf_path),
        "so_trang": n_pages,
        "trang_trong_rong": empty_pages,
        "extraction_method": "pdftotext(poppler)-UTF8-layout",
        "status": "ok" if n_pages > 0 and empty_pages < n_pages else "warning_low_yield",
    }
    return {"manifest": manifest_row, "pages": pages}


def run():
    manifest_rows = []
    pages_path = os.path.join(config.OUTPUT_DIR, "clean_pages.jsonl")
    with open(pages_path, "w", encoding="utf-8") as pages_f:
        for doc_meta in config.DOCUMENTS:
            print(f"[extract] {doc_meta['doc_id']} <- {doc_meta['file_name']}")
            result = extract_document(doc_meta)
            manifest_rows.append(result["manifest"])
            for page in result["pages"]:
                pages_f.write(json.dumps(page, ensure_ascii=False) + "\n")

    manifest_path = os.path.join(config.OUTPUT_DIR, "document_manifest.csv")
    fieldnames = list(manifest_rows[0].keys())
    with open(manifest_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(manifest_rows)

    print(f"[extract] wrote {manifest_path}")
    print(f"[extract] wrote {pages_path}")
    return manifest_rows


if __name__ == "__main__":
    run()
