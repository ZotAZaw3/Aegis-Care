-- Phase 03 (AI Ops Report) — bảng lưu báo cáo vận hành on-demand (lịch sử + bằng chứng demo).
-- Ghi bởi route /api/ops-report (JWT admin). metrics = snapshot tất định lúc tạo; report = text LLM (Mức 1).
-- KHÔNG số hóa giao ban — đây là báo cáo lãnh đạo đọc bất kỳ lúc nào.

CREATE TABLE IF NOT EXISTS public.ops_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from date NOT NULL,
  period_to   date NOT NULL,
  metrics     jsonb NOT NULL,          -- snapshot get_ops_metrics lúc tạo (nguồn kiểm chứng)
  report      text,                    -- text LLM (null nếu LLM lỗi — card vẫn có metrics)
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_reports_created ON public.ops_reports (created_at DESC);

GRANT SELECT, INSERT ON public.ops_reports TO authenticated;
GRANT ALL           ON public.ops_reports TO service_role;
ALTER TABLE public.ops_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ops_reports admin read"   ON public.ops_reports;
DROP POLICY IF EXISTS "ops_reports admin insert" ON public.ops_reports;
DROP POLICY IF EXISTS "ops_reports service all"  ON public.ops_reports;
CREATE POLICY "ops_reports admin read"   ON public.ops_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ops_reports admin insert" ON public.ops_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ops_reports service all"  ON public.ops_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);
