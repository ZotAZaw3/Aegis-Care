---
title: Agentic + RAG + Live Customer Graph — Backend
status: pending
blockedBy: []
blocks: []
created: 2026-07-18
scope: backend-only (KHÔNG UI)
---

# Plan — Lớp agentic + RAG + Customer Graph sống (backend)

Xây lớp AI-native trên hệ order-centric đã có: (A) scale EMR lên 500-1000 BN,
(B) biến Customer Graph thành SỐNG (BN mới tự vào graph), (C) port RAG compliance
sang pgvector + hybrid search, (D) copilot orchestrator (Vercel AI SDK) dùng hệ
hiện tại làm tools. Nguồn quyết định: `plans/260718-brainstorm-rag-kb-integration/brainstorm-report.md` (§6 AMENDMENT authoritative).

Nguyên tắc bất biến: **agent tư vấn — engine thi hành — người quyết**. Lane1 (panel
an toàn) TUYỆT ĐỐI không qua LLM. Retrieval-only, citation bắt buộc, KHÔNG kết luận lâm sàng.

## Phases

| # | Phase | Nội dung | Status | Phụ thuộc |
|---|-------|----------|--------|-----------|
| A | [ETL 500-1000 BN](phase-A-etl-scale-patients.md) | Node stream CSV → chọn BN giàu nha khoa/Lane1 → batch upsert supabase-js (service role) | pending | Đọc schema (đã có) |
| B | [Customer Graph sống](phase-B-live-customer-graph.md) | Cột `source`; triggers visit→encounter, order→procedure/medication; briefing bypass whitelist cho clinic | pending | Đọc schema (đã có) |
| C | [RAG port pgvector](phase-C-rag-pgvector.md) | Housekeeping rename; pipeline→chunks.jsonl; kb_documents/kb_chunks + kb_search RRF; ingest embed; port eval Hit@5 | pending | Đọc schema (đã có) |
| D | [Copilot orchestrator](phase-D-copilot-orchestrator.md) | Server route `/api/copilot`, AI SDK gpt-4o-mini, ~6 tools, JWT→RLS, anti-hallucination prompt, curl test | pending | **C** (kb_search) + **A** (data thật để test) |

## Dependency graph

```
A ──┐
B ──┼──(độc lập, chạy song song được)
C ──┴──► D   (D cần C.kb_search + A.data)
```

A, B, C độc lập sau khi đã đọc schema (đã đọc xong trong plan này) → có thể giao
song song cho 3 agent. D là bước cuối, cần C xong phần `kb_search` RPC + Node ingest,
và cần A đã nạp data thật để curl-test tool `patient_history`/`safety_panel` ra kết quả.

## Ràng buộc chung (mọi phase)
- KHÔNG commit secrets: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` → `.dev.vars` (gitignored) / Vercel env. KHÔNG để trong `.env` (đã tracked).
- File code < 200 dòng khi hợp lý; ETL script được phép dài hơn → tách module.
- kebab-case tên file; conventional commits; typecheck + verify sau mỗi phase.
- Migration đặt trong `supabase/migrations/` theo pattern timestamp hiện có, áp qua Supabase SQL Editor.

## Key dependencies
- Stack: TanStack Start + Nitro trên Vercel (server routes khả dụng), Supabase (Postgres + Auth + RLS + pgvector).
- Dữ liệu: `data/synthea-dental-dataset/csv/` (gitignored, 3.3GB), `data/compliance/` (13 PDF, commit được).
- Deps mới (Phase D): `ai`, `@ai-sdk/openai`. Phase C ingest: `openai` (Node) hoặc fetch trực tiếp.
