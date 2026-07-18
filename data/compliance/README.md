# Pipeline 1 — Compliance Knowledge Pipeline (DentalTech — VAIC 2026)

## Cấu trúc gói

```
./
├── *.pdf                    <- 13 văn bản nguồn (luật/thông tư/quyết định/SOP/mẫu biểu)
└── pipeline1_compliance/    <- Toàn bộ code pipeline + output đã generate sẵn
    ├── README.md            <- Đọc file này trước — hướng dẫn chi tiết đầy đủ
    ├── requirements.txt
    ├── .env                 <- Điền OPENAI_API_KEY vào đây nếu muốn dùng generation (gpt-4o-mini)
    ├── *.py                 <- Code từng bước pipeline
    └── output/               <- Kết quả đã chạy sẵn (KB, vector store, requirements, rules...)
```

**Quan trọng**: `pipeline1_compliance/` phải nằm CÙNG CẤP với các file PDF
(đúng như trong gói này) — code đọc PDF từ thư mục cha của chính nó
(`config.PDF_DIR`). Đừng tách rời 2 phần này khi giải nén/di chuyển.

## Bắt đầu nhanh

```bash
cd pipeline1_compliance
pip install -r requirements.txt
python sanity_check.py        # xác nhận output đã có sẵn hoạt động đúng (15/15 pass)
python rag.py                  # demo tìm kiếm (không cần API key)
```

Chi tiết đầy đủ (luồng xử lý, schema output, cách bật generation, giới hạn
đã biết) xem `pipeline1_compliance/README.md`.
