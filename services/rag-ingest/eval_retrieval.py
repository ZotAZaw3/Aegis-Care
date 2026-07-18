"""
Eval nho cho chat luong retrieval - vi khong co "dap an dung" khach quan
cho RAG, dung 1 bo cau hoi tay + tu khoa ky vong xuat hien trong citation
cua top-k ket qua (hit@k). Day la cach test dinh tinh nhung co so, khong
phai doc thu cong tung cau.

Chay: python eval_retrieval.py
"""
from rag import ComplianceRAG

# Moi item: cau hoi + list tu khoa (chi can 1 tu khoa xuat hien trong
# citation cua top-k la tinh HIT) - tu khoa lay tu chinh noi dung van ban
# da doc thu cong truoc do (Dieu 23 Khoan 8 Luat 51/2024 ve rang gia, v.v.)
EVAL_SET = [
    {
        "query": "Bảo hiểm y tế có chi trả cho răng giả không?",
        "expect_any": ["Điều 23", "51/2024"],
    },
    {
        "query": "Người bệnh có quyền được giữ bí mật thông tin hồ sơ bệnh án không?",
        "expect_any": ["Điều 10", "15/2023"],
    },
    {
        "query": "Người hành nghề phải làm gì khi xảy ra sự cố y khoa?",
        "expect_any": ["sự cố y khoa", "15/2023"],
    },
    {
        "query": "Mức hưởng bảo hiểm y tế đối với người nghèo là bao nhiêu?",
        "expect_any": ["Điều 22", "51/2024", "mức hưởng"],
    },
    {
        "query": "Quy trình giám định chi phí khám chữa bệnh bảo hiểm y tế",
        "expect_any": ["giám định", "12/2026"],
    },
    {
        "query": "Danh mục bệnh cần chữa trị dài ngày dùng mã gì?",
        "expect_any": ["ICD-10", "25/2025", "dài ngày"],
    },
    {
        "query": "Bệnh viện Răng Hàm Mặt Trung ương có nhiệm vụ gì?",
        "expect_any": ["2772", "nhiệm vụ"],
    },
    {
        "query": "Quy định về đăng ký xe máy khi tham gia giao thông",  # cau hoi KHONG lien quan
        "expect_any": None,  # ky vong: diem so thap, khong co gi lien quan ro rang
    },
]


def run(top_k: int = 5):
    rag = ComplianceRAG()
    n_hit, n_checkable = 0, 0

    for item in EVAL_SET:
        results = rag.search(item["query"], top_k=top_k)
        top_citations = " | ".join(r["citation"] for r in results)
        top_score = results[0]["score"] if results else 0.0

        print("\n" + "=" * 80)
        print("QUERY:", item["query"])
        for r in results[:3]:
            print(f"  [{r['score']:.3f}] {r['citation']} (trang {r['page_start']}-{r['page_end']})")

        if item["expect_any"] is None:
            flag = "OK (diem thap nhu ky vong)" if top_score < 0.45 else "CANH BAO (diem cao bat thuong cho cau hoi khong lien quan)"
            print(f"  -> Cau hoi kiem thu 'ngoai pham vi': {flag} (top_score={top_score:.3f})")
            continue

        n_checkable += 1
        hit = any(kw.lower() in top_citations.lower() for kw in item["expect_any"])
        n_hit += int(hit)
        print(f"  -> {'HIT' if hit else 'MISS'} (ky vong 1 trong {item['expect_any']})")

    print(f"\n===== Hit@{top_k}: {n_hit}/{n_checkable} ({n_hit/n_checkable*100:.0f}%) =====")


if __name__ == "__main__":
    run()
