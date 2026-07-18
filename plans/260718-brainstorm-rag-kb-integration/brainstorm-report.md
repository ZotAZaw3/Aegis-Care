# Brainstorm Report — Tích hợp RAG Compliance KB vào hệ thống

**Ngày:** 2026-07-18 · **Trạng thái:** ĐÃ CHỐT phương án, chờ plan.
**Input:** `rag service/` (pipeline Python của team, 17 file) + `data/compliance/` (13 văn bản pháp lý/SOP VN, 5.3MB).

## 1. Bối cảnh & câu hỏi mở đầu (đã trả lời)
- **Dataset Synthea đã dùng chưa?** Rồi — 3 BN seed trọn record vào `emr_*` + 134 mã whitelist trích từ 6 module. Full ETL 11.5k BN = Phase 02, post-24h. Dataset đã move vào `data/synthea-dental-dataset/` (gitignore che).
- **Customer Graph biểu diễn?** Postgres quan hệ (FK edges, 2-hop) + 3 lane đọc (safety hard-query / briefing LLM / crm) — không graph DB, có chủ đích.
- **"Chưa AI-native"?** Đúng một nửa (chỉ 1 điểm LLM). Fix đúng = lớp copilot orchestrator dùng hệ hiện tại làm tools — KHÔNG nhét agent vào đường deterministic (giữ nguyên tắc: agent tư vấn — engine thi hành — người quyết; Lane1 không bao giờ qua LLM).

## 2. Đánh giá RAG service của team
**Tài sản quý:**
- `structure_parser.py` — parse Chương-Điều-Khoản-Điểm, citation mức Khoản, xử lý luật sửa đổi lồng nhau + fallback trang. Khó, đã vá bug thật (vụ tách khoản sai → trả lời sai "BHYT chi trả răng giả").
- Hybrid retrieval dense+BM25+RRF — fix từ lỗi xếp hạng đo được.
- Prompt chống hallucination trong `answer_generator.py` (bắt buộc "cần đối chiếu thêm" khi context không nêu kết luận).
- Corpus 13 văn bản: Luật KCB 15/2023, Luật BHYT sửa đổi 51/2024, 6 Thông tư BYT, QĐ 6858 (83 tiêu chí), SOP DentalTech tự soạn, 2 mẫu bệnh án RHM.
- `rules.json` output = draft_needs_review — khớp triết lý hệ thống (người duyệt rule, engine thi hành).

**Điểm vênh:** Python local + sentence-transformers local (~470MB) ↔ stack đã chốt là Vercel + Supabase serverless (edge fn Deno không chạy được sentence-transformers → không có gì embed câu hỏi lúc runtime). `output/` chưa generate trên máy này (cần chạy pipeline: pip + poppler; Python 3.12 sẵn).

## 3. Phương án đã cân
| | A. Port pgvector (CHỌN) | B. Host Python service riêng |
|---|---|---|
| Runtime | Serverless thuần (khớp stack, 0 server mới) | Thêm server Railway/Render: deploy/tiền/cold-start/secret/điểm hỏng |
| Retrieval | pgvector cosine + Postgres FTS + RRF (giữ tinh thần hybrid) | Giữ 100% MiniLM+BM25 đã test |
| Embedding | OpenAI text-embedding-3-small (API; vài nghìn chunks → cents; chất lượng ≥ MiniLM multilingual) | Local |
| Kết luận | ✅ KISS, vừa thoát Lovable còn 2 mảnh — không mọc mảnh 3 | ❌ trừ khi tin MiniLM vượt OpenAI |

**Vai trò mới của Python pipeline:** công cụ **ingest OFFLINE** (chạy local khi thêm/sửa văn bản): PDF → chunks.jsonl (giữ nguyên parser). Bỏ bước embedder local — embed bằng OpenAI trong script ingest mới.

## 4. Phạm vi CHỐT lần này: "KB search trước"
1. **Housekeeping:** `rag service/` → `services/rag-ingest/` (bỏ dấu cách); commit code + `data/compliance/` (5.3MB); `data/synthea-*` giữ ignored.
2. **Chạy pipeline** local → `chunks.jsonl` (cần poppler).
3. **Schema:** `kb_documents` + `kb_chunks` (pgvector vector(1536) + tsvector generated) + RPC `kb_search(query_text, query_embedding)` = RRF(cosine top-N, FTS top-N) → chunk + citation.
4. **Ingest script:** đọc chunks.jsonl → OpenAI embed batch → upsert Supabase.
5. **Edge function `kb-ask`:** embed câu hỏi → kb_search → gpt-4o-mini tổng hợp với **prompt chống hallucination port từ answer_generator.py** → trả lời + citation (văn bản/Điều/Khoản/trang).
6. **UI:** tab/trang "Tra cứu quy định" (mọi vai) — hỏi → trả lời + citation chips. Đơn giản, chưa phải chat orchestrator.

**Để SAU (đã design, chưa làm):** copilot orchestrator tool-calling (kb_search + 5 RPC sẵn) + chat toàn cục — nâng cấp tự nhiên từ kb-ask.

## 5. Rủi ro
| Rủi ro | Giảm nhẹ |
|---|---|
| FTS 'simple' tiếng Việt không stemming | Vai trò chỉ là keyword-match layer (như BM25 gốc); dense lo semantic |
| Đổi embedding làm lệch kết quả vs bản team test | Port luôn `eval_retrieval.py` (Hit@5) chạy lại trên pgvector để so |
| Pipeline cần poppler trên Windows | Ghi rõ bước cài; fallback pypdf có sẵn trong code |
| Chi phí embed | ~vài nghìn chunks × text-embedding-3-small ≈ cents |

## 6. AMENDMENT (chốt sau vòng 2 — thay §4 phạm vi cũ)
User chỉ đạo 3 điểm, ĐÃ CHỐT:
1. **Scale 500-1000 BN** (không phải 3): Node ETL script (không SQL file — ~200-400k dòng), stream CSV, chọn BN theo độ giàu nha khoa + bệnh nền Lane1, batch upsert bằng service-role key từ `.dev.vars`. Bỏ observations.csv.
2. **Customer Graph SỐNG**: `emr_*` = bệnh sử canonical, 2 nguồn qua cột `source` ('synthea'|'clinic'). Trigger: visit done → emr_encounters; procedure/medication order đóng → emr_procedures/emr_medications. BN mới tự vào graph. Briefing bypass whitelist cho source='clinic'.
3. **Backend-only** (UI sau) + **full copilot orchestrator** (không dừng ở KB search): framework = **Vercel AI SDK** (chọn vs LangGraph: single-loop tool-calling 1 orchestrator + ~6 tools, chạy trong TanStack server route `/api/copilot` trên Vercel đã deploy, key ở Vercel env, tools gọi Supabase bằng JWT user → RLS. LangGraph để dành khi cần multi-agent stateful thật). Prompt chống hallucination port từ `answer_generator.py`. Trả JSON {answer, citations, tool_calls}, streaming-ready.

**4 phase backend:** A. ETL 500-1000 BN · B. Graph sống (source + triggers) · C. RAG port (pipeline → chunks.jsonl → pgvector + kb_search hybrid RRF + ingest embed + port eval Hit@5) · D. Orchestrator AI SDK + 6 tools + curl test.

## 7. Bước tiếp
→ `/ck:plan` cho 4 phase trên. Liên quan: plan `260718-0111` (phase-02 ETL cũ được thay bằng Phase A ở đây).
