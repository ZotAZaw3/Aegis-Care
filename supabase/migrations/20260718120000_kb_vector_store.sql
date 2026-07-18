-- Phase C — RAG compliance knowledge base trên pgvector.
-- Nguồn: services/rag-ingest/ (pipeline Python PDF -> chunks.jsonl). Runtime search
-- chuyển sang pgvector (dense) + Postgres FTS 'simple' (lexical), hợp nhất bằng RRF
-- trong RPC kb_search. Embedding sinh ở Node ingest bằng OpenAI text-embedding-3-small
-- (1536-dim). Migration idempotent (re-run an toàn).

CREATE EXTENSION IF NOT EXISTS vector;

-- ============ kb_documents: metadata 13 văn bản nguồn (từ config.DOCUMENTS) ============
CREATE TABLE IF NOT EXISTS public.kb_documents (
  doc_id            text PRIMARY KEY,
  ten_van_ban       text NOT NULL,
  so_hieu           text,
  loai_van_ban      text,
  co_quan_ban_hanh  text,
  ngay_ban_hanh     date,
  ngay_hieu_luc     date
);

INSERT INTO public.kb_documents
  (doc_id, ten_van_ban, so_hieu, loai_van_ban, co_quan_ban_hanh, ngay_ban_hanh, ngay_hieu_luc)
VALUES
  ('LAW_15_2023_KCB', 'Luật Khám bệnh, chữa bệnh', '15/2023/QH15', 'Luật', 'Quốc hội', '2023-01-09'::date, '2024-01-01'::date),
  ('LAW_51_2024_BHYT_AMD', 'Luật sửa đổi, bổ sung một số điều của Luật Bảo hiểm y tế', '51/2024/QH15', 'Luật', 'Quốc hội', '2024-11-27'::date, '2025-07-01'::date),
  ('QD_2772_2020_RHMTW', 'Quy chế Tổ chức và Hoạt động của Bệnh viện Răng Hàm Mặt Trung ương Hà Nội', '2772/QĐ-BYT', 'Quyết định', 'Bộ Y tế', '2020-07-01'::date, '2020-07-01'::date),
  ('TT_12_2026_BTC', 'Thông tư quy định trình tự, thủ tục giám định chi phí khám bệnh, chữa bệnh bảo hiểm y tế, biểu mẫu tổng hợp thanh toán, quyết toán và biện pháp thi hành Nghị định số 188/2025/NĐ-CP', '12/2026/TT-BTC', 'Thông tư', 'Bộ Tài chính', '2026-02-10'::date, '2026-02-10'::date),
  ('TT_25_2025_BYT', 'Thông tư quy định chi tiết thi hành Luật Bảo hiểm xã hội, Luật An toàn, vệ sinh lao động thuộc lĩnh vực y tế và một số điều của Luật Khám bệnh, chữa bệnh', '25/2025/TT-BYT', 'Thông tư', 'Bộ Y tế', '2025-06-30'::date, '2025-07-01'::date),
  ('SOP_01_2026_DENTALTECH', 'Quy trình vận hành lâm sàng và kiểm soát chất lượng nội bộ - DentalTech JSC', '01/2026/QT-DENTALTECH', 'Quy trình nội bộ', 'DentalTech JSC (tự soạn, dựa trên QĐ 2121/QĐ-BYT, TT 16/2018/TT-BYT, QĐ 6858/QĐ-BYT)', '2026-07-17'::date, '2026-07-17'::date),
  ('TT_13_2025_BYT_HSBADT', 'Thông tư hướng dẫn triển khai hồ sơ bệnh án điện tử', '13/2025/TT-BYT', 'Thông tư', 'Bộ Y tế', '2025-06-06'::date, '2025-06-06'::date),
  ('TT_16_2018_BYT_KSNK', 'Thông tư quy định về kiểm soát nhiễm khuẩn trong các cơ sở khám bệnh, chữa bệnh', '16/2018/TT-BYT', 'Thông tư', 'Bộ Y tế', '2018-07-20'::date, '2018-10-01'::date),
  ('TT_23_2011_BYT_SDT', 'Thông tư hướng dẫn sử dụng thuốc trong các cơ sở y tế có giường bệnh', '23/2011/TT-BYT', 'Thông tư', 'Bộ Y tế', '2011-06-10'::date, '2011-06-10'::date),
  ('TT_26_2025_BYT_DT', 'Thông tư quy định về đơn thuốc và việc kê đơn thuốc hóa dược, sinh phẩm trong điều trị ngoại trú tại cơ sở khám bệnh, chữa bệnh', '26/2025/TT-BYT', 'Thông tư', 'Bộ Y tế', '2025-06-30'::date, '2025-06-30'::date),
  ('QD_6858_2016_BYT_83TC', 'Bộ tiêu chí chất lượng bệnh viện Việt Nam (phiên bản 2.0)', '6858/QĐ-BYT', 'Quyết định', 'Bộ Y tế', '2016-11-18'::date, '2016-11-18'::date),
  ('MAU_13_BENH_AN_RHM', 'Mẫu bệnh án Răng - Hàm - Mặt (nội trú)', '13/BV-01', 'Mẫu biểu chuẩn', 'Bộ Y tế', NULL, NULL),
  ('MAU_16_BENH_AN_NGOAI_TRU_RHM', 'Mẫu bệnh án ngoại trú chuyên khoa Răng Hàm Mặt', '16/BV-01', 'Mẫu biểu chuẩn', 'Bộ Y tế', NULL, NULL)
ON CONFLICT (doc_id) DO UPDATE SET
  ten_van_ban = EXCLUDED.ten_van_ban,
  so_hieu = EXCLUDED.so_hieu,
  loai_van_ban = EXCLUDED.loai_van_ban,
  co_quan_ban_hanh = EXCLUDED.co_quan_ban_hanh,
  ngay_ban_hanh = EXCLUDED.ngay_ban_hanh,
  ngay_hieu_luc = EXCLUDED.ngay_hieu_luc;

-- ============ kb_chunks: 1 dòng / chunk (≈1 khoản), citation sẵn + embedding ============
-- id = chunk_id từ chunker (idempotent key cho ingest onConflict).
CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id          text PRIMARY KEY,
  doc_id      text NOT NULL REFERENCES public.kb_documents(doc_id),
  citation    text NOT NULL,
  dieu        text,
  khoan       text,
  page_start  int,
  page_end    int,
  content     text NOT NULL,
  embedding   vector(1536),
  fts         tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);

-- HNSW cosine cho dense; GIN cho FTS. Tập ~1k chunks nên index là tối ưu (không bắt buộc).
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON public.kb_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_fts
  ON public.kb_chunks USING gin (fts);

-- ============ RLS: staff-read, admin-write, service_role ALL ============
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kb_documents staff read"    ON public.kb_documents;
DROP POLICY IF EXISTS "kb_documents admin write"   ON public.kb_documents;
DROP POLICY IF EXISTS "kb_documents service all"   ON public.kb_documents;
DROP POLICY IF EXISTS "kb_chunks staff read"       ON public.kb_chunks;
DROP POLICY IF EXISTS "kb_chunks admin write"      ON public.kb_chunks;
DROP POLICY IF EXISTS "kb_chunks service all"      ON public.kb_chunks;

CREATE POLICY "kb_documents staff read"  ON public.kb_documents FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "kb_documents admin write" ON public.kb_documents FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "kb_documents service all" ON public.kb_documents FOR ALL    TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "kb_chunks staff read"  ON public.kb_chunks FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "kb_chunks admin write" ON public.kb_chunks FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "kb_chunks service all" ON public.kb_chunks FOR ALL    TO service_role USING (true) WITH CHECK (true);

-- ============ RPC kb_search: hybrid RRF (dense top-30 + FTS top-30, k=60) ============
-- SECURITY INVOKER (mặc định) -> RLS staff-read của kb_chunks áp dụng: staff thấy,
-- non-staff rỗng. RRF_K=60. Dense = cosine distance (<=>) ORDER ASC. Lexical = ts_rank DESC.
CREATE OR REPLACE FUNCTION public.kb_search(
  p_query     text,
  p_embedding vector(1536),
  p_k         int DEFAULT 8
)
RETURNS TABLE (
  id         text,
  doc_id     text,
  citation   text,
  page_start int,
  content    text,
  score      double precision
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH dense AS (
    SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> p_embedding) AS r
    FROM public.kb_chunks c
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> p_embedding
    LIMIT 30
  ),
  lex AS (
    SELECT c.id,
           row_number() OVER (
             ORDER BY ts_rank(c.fts, websearch_to_tsquery('simple', p_query)) DESC
           ) AS r
    FROM public.kb_chunks c
    WHERE c.fts @@ websearch_to_tsquery('simple', p_query)
    ORDER BY ts_rank(c.fts, websearch_to_tsquery('simple', p_query)) DESC
    LIMIT 30
  ),
  fused AS (
    SELECT u.id, SUM(1.0 / (60 + u.r)) AS score
    FROM (
      SELECT id, r FROM dense
      UNION ALL
      SELECT id, r FROM lex
    ) u
    GROUP BY u.id
  )
  SELECT c.id, c.doc_id, c.citation, c.page_start, c.content, f.score
  FROM fused f
  JOIN public.kb_chunks c USING (id)
  ORDER BY f.score DESC
  LIMIT p_k;
$$;

REVOKE EXECUTE ON FUNCTION public.kb_search(text, vector, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.kb_search(text, vector, int) TO authenticated;
