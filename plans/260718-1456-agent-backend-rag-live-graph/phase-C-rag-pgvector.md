# Phase C — RAG compliance port sang pgvector

## Context Links
- Brainstorm §3-5, §6.3 (authoritative)
- Pipeline Python: `rag service/` → `chunker.py` (đơn vị chunk = 1 Khoản, có `citation`, `page_start/end`, `dieu_so`, `khoan_so`), `rag.py` (RRF hybrid), `answer_generator.py` (prompt chống hallucination), `eval_retrieval.py` (Hit@5), `config.py`, `README.md`
- Corpus: `data/compliance/` (13 PDF, 5.3MB — commit được)
- Client server: `src/integrations/supabase/client.server.ts`

## Overview
- **Priority:** cao — chặn D.
- **Status:** pending.
- Đổi vai pipeline Python → công cụ ingest OFFLINE (PDF → `chunks.jsonl`, giữ parser/citation). Runtime search chuyển sang pgvector + Postgres FTS + RRF trong RPC `kb_search`. Embed bằng OpenAI `text-embedding-3-small` (1536-dim). Port `eval_retrieval.py` đo Hit@5 trên pgvector so bản gốc.

## Key Insights
- Bỏ bước embedder local (sentence-transformers 470MB) — không chạy được trên serverless. Chunks.jsonl KHÔNG cần embedding; embed ở Node ingest bằng OpenAI.
- `chunks.jsonl` đã có sẵn mọi field cần: `chunk_id`, `doc_id`, `citation`, `dieu_so`, `khoan_so`, `page_start/end`, `text`. → map thẳng vào `kb_chunks`.
- `config.PDF_DIR = BASE_DIR` (thư mục cha). Sau khi move `rag service/` → `services/rag-ingest/`, PDF ở `data/compliance/` (KHÁC cây thư mục) → PHẢI sửa `config.PDF_DIR` trỏ tới `data/compliance/` + đồng bộ `file_name` trong `config.DOCUMENTS` (đã khớp tên trong `data/compliance/`).
- Poppler `pdftotext` cho tiếng Việt chính xác hơn; Windows cần cài + PATH. Fallback `pypdf` có sẵn trong code nếu thiếu poppler.
- FTS 'simple' không stemming tiếng Việt → chỉ là lớp keyword-match (thay BM25 gốc); dense lo semantic. Đúng tinh thần hybrid.
- ~1.5k chunks → embed OpenAI ≈ cents. Idempotent theo `chunk_id`.

## Requirements
**Functional**
- (i) Housekeeping: `rag service/` → `services/rag-ingest/` (bỏ dấu cách). Commit code + `data/compliance/` PDFs. `data/synthea-*` giữ ignored.
- (ii) Chạy pipeline local → `services/rag-ingest/output/chunks.jsonl`.
- (iii) Migration: extension `vector`; `kb_documents`; `kb_chunks(id, doc_id, chunk_id, citation, dieu, khoan, page_start, page_end, content, embedding vector(1536), fts tsvector GENERATED)`; index ivfflat/hnsw (cosine) + GIN (fts); RLS staff-read/admin-write.
- (iv) RPC `kb_search(p_query text, p_embedding vector(1536), p_k int)` = RRF(cosine top-N, FTS websearch top-N) → trả chunk + citation.
- (v) Node ingest: `chunks.jsonl` → OpenAI embed batch → upsert `kb_chunks` idempotent theo `chunk_id`.
- (vi) Port `eval_retrieval.py` → chạy trên pgvector, đo Hit@5 so bản gốc.

**Non-functional**: không commit key; migration idempotent; ingest re-run không nhân đôi.

## Architecture
```sql
-- migration 20260718120000_kb_rag_pgvector.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE public.kb_documents (
  doc_id text PRIMARY KEY, ten_van_ban text, so_hieu text, loai_van_ban text,
  co_quan_ban_hanh text, ngay_hieu_luc date
);
CREATE TABLE public.kb_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id text UNIQUE NOT NULL,             -- idempotent key (từ chunker)
  doc_id text NOT NULL REFERENCES public.kb_documents(doc_id),
  citation text NOT NULL,
  dieu text, khoan text, page_start int, page_end int,
  content text NOT NULL,
  embedding vector(1536),
  fts tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);
CREATE INDEX idx_kb_chunks_embedding ON public.kb_chunks
  USING hnsw (embedding vector_cosine_ops);           -- hoặc ivfflat nếu hnsw không có
CREATE INDEX idx_kb_chunks_fts ON public.kb_chunks USING gin (fts);

-- RLS: staff read, admin write
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks    ENABLE ROW LEVEL SECURITY;
-- GRANT SELECT authenticated; policy is_staff(); write via service_role/admin
```
RPC RRF (hybrid, giữ RRF_K=60, pool N=60 như bản gốc):
```sql
CREATE OR REPLACE FUNCTION public.kb_search(p_query text, p_embedding vector(1536), p_k int DEFAULT 5)
RETURNS TABLE (chunk_id text, citation text, content text, page_start int, page_end int, score double precision)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH dense AS (
    SELECT c.chunk_id, row_number() OVER (ORDER BY c.embedding <=> p_embedding) AS r
    FROM public.kb_chunks c ORDER BY c.embedding <=> p_embedding LIMIT 60
  ),
  lex AS (
    SELECT c.chunk_id,
           row_number() OVER (ORDER BY ts_rank(c.fts, websearch_to_tsquery('simple', p_query)) DESC) AS r
    FROM public.kb_chunks c
    WHERE c.fts @@ websearch_to_tsquery('simple', p_query) LIMIT 60
  ),
  fused AS (
    SELECT chunk_id, SUM(1.0/(60+r)) AS score FROM (
      SELECT chunk_id, r FROM dense UNION ALL SELECT chunk_id, r FROM lex
    ) u GROUP BY chunk_id
  )
  SELECT c.chunk_id, c.citation, c.content, c.page_start, c.page_end, f.score
  FROM fused f JOIN public.kb_chunks c USING (chunk_id)
  ORDER BY f.score DESC LIMIT p_k;
$$;
GRANT EXECUTE ON FUNCTION public.kb_search(text, vector, int) TO authenticated;
```
Node ingest `services/rag-ingest/ingest-to-supabase.mjs`:
```
đọc output/chunks.jsonl → dedup theo chunk_id → batch 100 → POST OpenAI embeddings
(text-embedding-3-small, dimensions=1536) → upsert kb_documents (từ config metadata)
+ upsert kb_chunks onConflict=chunk_id. Key từ .dev.vars + OPENAI_API_KEY (env).
```

## Related Code Files
**Create**
- `supabase/migrations/20260718120000_kb_rag_pgvector.sql` — tables + indexes + RLS + `kb_search`.
- `services/rag-ingest/ingest-to-supabase.mjs` — embed + upsert.
- `services/rag-ingest/eval-kb-search.mjs` — port EVAL_SET (từ `eval_retrieval.py`) chạy qua `kb_search` (embed query OpenAI → rpc → Hit@5).

**Modify**
- `services/rag-ingest/config.py` — `PDF_DIR` trỏ `data/compliance/`; kiểm `file_name` khớp.
- `.gitignore` — xác nhận `data/compliance/` KHÔNG bị ignore; `services/rag-ingest/output/` có thể ignore (artefact) trừ `chunks.jsonl` nếu muốn commit.
- `.dev.vars` — thêm `OPENAI_API_KEY` (dùng chung cho ingest + Phase D local).

**Delete**
- Thư mục `rag service/` (đổi tên/di chuyển → `services/rag-ingest/`, không xoá nội dung).
- `services/rag-ingest/embedder.py`, `vector_store/` không còn dùng ở runtime (giữ file để pipeline chạy local vẫn ok, nhưng KHÔNG ingest vào Supabase). KHÔNG bắt buộc xoá.

## Implementation Steps
1. `git mv "rag service" services/rag-ingest` (giữ history). Sửa `config.PDF_DIR = <repo>/data/compliance`. Đối chiếu 13 `file_name` với `data/compliance/` (tên có dấu "Bộ 83..." — giữ đúng).
2. Cài `services/rag-ingest/requirements.txt` (venv). Cài poppler Windows (tải poppler-*-win, thêm `bin` vào PATH) — kiểm `pdftotext -v`. Nếu không được → dựa fallback pypdf (chất lượng thấp hơn, ghi log).
3. Chạy `python run_pipeline.py` → sinh `output/chunks.jsonl` (+ articles/clauses). Chạy `python sanity_check.py`.
4. Viết migration pgvector (tables/index/RLS/kb_search). Áp qua Supabase SQL Editor. Xác nhận extension `vector` bật (Supabase hỗ trợ sẵn).
5. Viết `ingest-to-supabase.mjs`: đọc chunks.jsonl, upsert `kb_documents` từ `config.DOCUMENTS` (export JSON phụ hoặc hardcode 13 dòng), embed batch OpenAI, upsert `kb_chunks` onConflict `chunk_id`.
6. Chạy ingest; verify `SELECT count(*) FROM kb_chunks` ≈ số dòng chunks.jsonl.
7. Viết `eval-kb-search.mjs` dùng cùng EVAL_SET; với mỗi query: embed → `rpc('kb_search',{p_query,p_embedding,p_k:5})` → check `expect_any` trong citation. In Hit@5.
8. Chạy eval; so số với Hit@5 bản Python gốc (README nói phần lớn HIT). Ghi lại chênh lệch.
9. lint/node --check các .mjs.

## Todo List
- [ ] `git mv "rag service" services/rag-ingest` + sửa `config.PDF_DIR`
- [ ] Cài venv + poppler; `pdftotext -v` OK
- [ ] `python run_pipeline.py` → chunks.jsonl + sanity_check
- [ ] Migration kb_documents/kb_chunks + index + RLS + `kb_search`
- [ ] `ingest-to-supabase.mjs` embed + upsert idempotent
- [ ] Chạy ingest, verify count
- [ ] `eval-kb-search.mjs` Hit@5 trên pgvector
- [ ] So Hit@5 vs bản gốc, ghi kết quả
- [ ] Commit code + data/compliance PDFs (KHÔNG key)

## Success Criteria (đo được)
- `SELECT count(*) FROM kb_chunks WHERE embedding IS NOT NULL` = số chunk trong chunks.jsonl (không NULL sót).
- Chạy ingest lần 2 → count không đổi (idempotent theo chunk_id).
- `kb_search('Bảo hiểm y tế có chi trả cho răng giả không?', <embed>, 5)` trả chunk chứa citation "Điều 23" / "51/2024".
- `eval-kb-search.mjs` Hit@5 ≥ bản gốc − 1 (không tụt quá 1 câu so Python). Câu "ngoài phạm vi" không trả điểm cao bất thường.
- Không có OPENAI/service key trong diff commit.

## Risk Assessment
- **Poppler thiếu trên Windows** → fallback pypdf (ghi rõ, chất lượng dấu kém hơn → có thể lệch parse). Mitigate: ưu tiên cài poppler.
- **Đổi embedding lệch kết quả vs team test** → chính là lý do port eval; nếu tụt nhiều, cân nhắc tăng pool N hoặc kiểm FTS query.
- **hnsw không khả dụng** → dùng ivfflat (cần `SET ivfflat.probes`), hoặc để seq-scan (1.5k chunks vẫn nhanh) — index là tối ưu, không bắt buộc cho tập nhỏ.
- **FTS 'simple' tiếng Việt yếu** → chấp nhận (vai keyword-layer); dense gánh semantic.

## Security Considerations
- OPENAI_API_KEY + service role chỉ ở `.dev.vars`/Vercel env; ingest chạy local.
- `kb_chunks`/`kb_documents` RLS staff-read (không phải PII nhưng giữ nhất quán); write qua service_role/admin.
- KHÔNG commit `output/vector_store/` (artefact); commit `chunks.jsonl` optional (nhỏ, tiện re-ingest).

## Next Steps
- `kb_search` RPC + embed pattern → tool `kb_search` của Phase D.
- Prompt chống hallucination trong `answer_generator.py` → port vào system prompt Phase D.
