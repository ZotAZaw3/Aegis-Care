# Pipeline 1 — Compliance Knowledge Pipeline

Biến văn bản pháp luật/quy chế/SOP (PDF) thành Knowledge Base tuân thủ có thể
tìm kiếm, trích dẫn và kiểm tra, phục vụ lớp điều phối AI agent của Clinic
Operation System (VAIC 2026 — đề bài DentalTech).

## Cài đặt

```bash
pip install -r requirements.txt
```

Cần cài thêm **poppler** (lệnh `pdftotext` phải chạy được từ terminal) —
dùng để trích xuất văn bản tiếng Việt chính xác hơn `pypdf` (không bị lỗi
mất dấu). Windows: tải poppler for Windows, thêm thư mục `bin` vào PATH.

PDF nguồn (13 file) phải nằm ở thư mục **cha** của `pipeline1_compliance/`
(xem `config.PDF_DIR`), tức là cùng cấp với chính thư mục này — đã sắp sẵn
đúng vị trí trong gói này.

## Luồng xử lý

```
PDF quy định/SOP/mẫu biểu (13 file)
  -> pdf_extract.py       (ingest + extract text theo trang + preprocessing)
  -> structure_parser.py  (parse Chương-Mục-Điều-Khoản-Điểm -> articles + clauses)
  -> chunker.py           (chunk theo cấu trúc + gắn metadata nguồn)
  -> embedder.py          (embedding local + vector store)
  -> requirements_extractor.py  (điều khoản -> yêu cầu chuẩn hóa)
  -> rules_builder.py           (yêu cầu -> rule draft + mapping)
```

Chạy toàn bộ: `python run_pipeline.py` (từ trong thư mục `pipeline1_compliance/`).
Output đã được **generate sẵn** trong `output/` — không bắt buộc phải chạy lại
trừ khi bạn thêm/sửa văn bản nguồn.

## 13 văn bản nguồn (`config.DOCUMENTS`)

| doc_id | Loại | Nội dung |
|---|---|---|
| `LAW_15_2023_KCB` | Luật | Luật Khám bệnh, chữa bệnh 15/2023/QH15 |
| `LAW_51_2024_BHYT_AMD` | Luật | Luật sửa đổi, bổ sung Luật BHYT 51/2024/QH15 |
| `QD_2772_2020_RHMTW` | Quyết định | Quy chế tổ chức BV Răng Hàm Mặt TW Hà Nội |
| `TT_12_2026_BTC` | Thông tư | Giám định chi phí KCB BHYT |
| `TT_25_2025_BYT` | Thông tư | Danh mục bệnh dài ngày, giám định y khoa |
| `SOP_01_2026_DENTALTECH` | Quy trình nội bộ | **Tự soạn** — checklist lâm sàng, kiểm soát nhiễm khuẩn, bàn giao ca, tái khám (dựa trên QĐ 2121/QĐ-BYT, TT 16/2018, QĐ 6858/QĐ-BYT — xem Điều 22-23 để rõ nguồn) |
| `TT_13_2025_BYT_HSBADT` | Thông tư | Hồ sơ bệnh án điện tử |
| `TT_16_2018_BYT_KSNK` | Thông tư | Kiểm soát nhiễm khuẩn trong cơ sở KCB |
| `TT_23_2011_BYT_SDT` | Thông tư | Sử dụng thuốc trong cơ sở y tế có giường bệnh |
| `TT_26_2025_BYT_DT` | Thông tư | Đơn thuốc và kê đơn thuốc ngoại trú |
| `QD_6858_2016_BYT_83TC` | Quyết định | Bộ tiêu chí chất lượng bệnh viện Việt Nam (83 tiêu chí, 151 trang) |
| `MAU_13_BENH_AN_RHM` | Mẫu biểu | Mẫu bệnh án Răng-Hàm-Mặt nội trú (13/BV-01) |
| `MAU_16_BENH_AN_NGOAI_TRU_RHM` | Mẫu biểu | Mẫu bệnh án ngoại trú RHM (16/BV-01) |

Muốn thêm văn bản mới: thêm PDF vào thư mục cha + thêm 1 entry vào
`config.DOCUMENTS`, rồi chạy lại `python run_pipeline.py`.

## Output (`output/`)

| File | Sinh bởi | Nội dung |
|---|---|---|
| `document_manifest.csv` | pdf_extract | Metadata 13 văn bản (số hiệu, ngày ban hành, số trang...) |
| `clean_pages.jsonl` | pdf_extract | Text đã làm sạch theo từng trang |
| `articles.jsonl` | structure_parser | 1 dòng / Điều, kèm Chương/Mục cha |
| `clauses.jsonl` | structure_parser | 1 dòng / Khoản (kèm mảng `diem` con) — đơn vị trích dẫn pháp lý nhỏ nhất |
| `chunks.jsonl` | chunker | 1 dòng / chunk (≈1 khoản; khoản dài bị cắt thêm), có `citation` sẵn |
| `vector_store/` | embedder | `embeddings.npy` + `meta.jsonl` + `manifest.json` |
| `requirements.csv` | requirements_extractor | Ứng viên yêu cầu tuân thủ (dò từ khóa "phải"/"không được"...) |
| `rules.json` | rules_builder | Rule draft dạng field/operator/value + 1 rule mẫu đã hoàn thiện |
| `rule_evidence_mapping.csv` | rules_builder | rule ↔ khoản nguồn ↔ bảng dữ liệu gợi ý |

## Lớp RAG — Hybrid retrieval (Dense + BM25, hợp nhất bằng RRF)

```python
from rag import ComplianceRAG
rag = ComplianceRAG()
for r in rag.search("Phải có consent trước khi thực hiện thủ thuật?", top_k=5):
    print(r["score"], r["citation"], r["page_start"], r["text"][:150])
```

`python rag.py` chạy demo với vài câu hỏi mẫu (chỉ retrieval, không cần API key).

Retrieval kết hợp **dense** (sentence-transformers, hiểu ý nghĩa/paraphrase)
và **BM25** (khớp từ khóa chính xác — số Điều, thuật ngữ), hợp nhất bằng
Reciprocal Rank Fusion. Lý do: dense đơn thuần từng xếp nhầm chunk trùng từ
bề mặt lên cao hơn chunk đúng chủ đề (đo được cụ thể khi test). Xem
`CANDIDATE_POOL`/`RRF_K` trong `rag.py` nếu cần tinh chỉnh.

### Retrieval + Generation (gpt-4o-mini)

1. Mở file `.env`, điền `OPENAI_API_KEY=<key thật>` (model mặc định
   `gpt-4o-mini`, đổi qua biến `OPENAI_MODEL` nếu cần). **File `.env` trong
   gói này KHÔNG chứa key thật** — đã cố tình xóa trước khi gửi.
2. Chạy:
   ```bash
   python ask.py "Phải có consent hợp lệ trước khi thực hiện thủ thuật không?"
   ```
   Luồng: câu hỏi/cảnh báo → `rag.py` tìm Điều/Khoản liên quan trong vector
   store → `answer_generator.py` gọi OpenAI (`gpt-4o-mini`) tổng hợp câu trả
   lời, chỉ dựa trên context lấy được, kèm citation văn bản/điều/khoản/trang.
3. Nếu `.env` chưa có key, `ask.py` vẫn chạy được — chỉ in kết quả retrieval
   thô và nhắc điền key, không lỗi. Generation tự bật lên ngay khi có key.
4. **System prompt có chặn hallucination theo hướng suy diễn sai chiều**: nếu
   context chỉ liệt kê đối tượng mà không nêu rõ kết luận (được/không được),
   model bắt buộc phải nói "cần đối chiếu thêm", không được tự đoán có/không.
   Đây là fix cho 1 lỗi thật đã phát hiện khi test (xem mục Giới hạn bên dưới).

## Công cụ test

- `python sanity_check.py` — kiểm tra toàn vẹn dữ liệu xuyên suốt pipeline
  (referential integrity giữa articles/clauses/chunks/vector_store/requirements/rules).
  Chạy sau MỖI lần sửa code hoặc thêm văn bản mới.
- `python eval_retrieval.py` — bộ câu hỏi tay + từ khóa kỳ vọng, đo Hit@5,
  bao gồm 1 câu "ngoài phạm vi" để kiểm tra retrieval không trả bừa.

## Điểm cần biết / giới hạn

1. **`requirements.csv` và `rules.json` là bán tự động, chưa phải rule production.**
   Mọi rule đều gắn `status="draft_needs_review"` và field điều kiện để `<TBD>` —
   dò từ khóa (phải/không được/nghiêm cấm...) chỉ tìm ỨNG VIÊN, đội compliance
   phải đọc `citation_text` và tự xác nhận + điền field hệ thống thật trước khi
   dùng để chạy rule trong Clinic Operation System. Có 1 rule mẫu
   (`RULE_SEED_001`, status `verified_example`) làm khuôn theo đúng ví dụ trong
   đề bài (consent trước thủ thuật) để tham khảo khi tự điền các rule khác.
2. **`TT_12_2026_BTC.pdf` có lỗi trùng nội dung ở nguồn**: 17 Điều đầu bị lặp
   nguyên văn 2 lần trong file PDF gốc (khả năng lỗi khi xuất PDF từ vbpl.vn).
   `structure_parser.py` tự phát hiện và loại bản lặp (giữ bản xuất hiện trước),
   có log cảnh báo khi chạy.
3. **Luật sửa đổi, bổ sung có số khoản lồng nhau trong ngoặc kép** (VD Luật
   51/2024: "18. Sửa đổi, bổ sung khoản 7 và khoản 8 Điều 23 như sau: "7. ...
   8. ...".") — parser tự phát hiện mẫu câu "Sửa đổi/Bổ sung ... Điều X như
   sau:" và giữ nguyên toàn bộ nội dung trích dẫn trong 1 khoản duy nhất
   (không tách nhầm thành khoản giả), đồng thời gắn nhãn `amendment_ref` để
   citation hiện rõ "(nội dung sửa đổi Điều X của văn bản gốc)". Đây là fix
   cho 1 lỗi hallucination thật đã phát hiện: agent từng trả lời SAI "BHYT có
   chi trả răng giả" vì đọc nhầm 1 khoản bị tách sai thiếu câu dẫn.
4. **Văn bản không có cấu trúc Chương-Điều-Khoản** (mẫu biểu bệnh án, hoặc
   văn bản có bảng/layout phức tạp như "Bộ 83 tiêu chí") — tự động fallback
   sang chunk theo TRANG, citation hiển thị "Trang X" thay vì "Điều X". Xem
   `_fallback_page_level()` trong `structure_parser.py`.
5. **Phụ lục/biểu mẫu/khối chữ ký ("Nơi nhận...") không được ép vào cấu trúc
   Khoản/Điểm** — vì đó không phải là "khoản" pháp lý. Nội dung này vẫn còn
   nguyên trong `clean_pages.jsonl` (theo trang gốc) nhưng không xuất hiện
   trong `articles.jsonl`/`clauses.jsonl`.
6. **Embedding model**: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`,
   chạy local — không cần API key/internet lúc demo (chỉ cần tải model 1 lần,
   ~470MB, tự tải khi chạy lần đầu). Nếu môi trường không có sentence-transformers,
   `embedder.py` tự fallback sang TF-IDF (scikit-learn) để không làm gãy pipeline.
7. **`suggested_tables`/`suggested_system_tables`** trong requirements/rules chỉ
   là gợi ý từ khóa dựa theo tên các bảng CSV Synthea sẵn có (xem
   `config.TABLE_KEYWORD_HINTS`) — không phải mapping đã xác minh.
8. Đã test kỹ với ~10 câu hỏi tình huống CPOE/CRM thực tế (checklist trước
   thủ thuật, dị ứng thuốc, bàn giao ca, tái khám...) — phần lớn trả lời đúng
   có trích dẫn; 1-2 tình huống hiếm (câu hỏi cần gộp thông tin từ nhiều
   Điều rời rạc) vẫn có thể bị agent từ chối trả lời thay vì tổng hợp — đây
   là hành vi AN TOÀN có chủ đích (thà từ chối còn hơn suy diễn sai), không
   phải bug.
