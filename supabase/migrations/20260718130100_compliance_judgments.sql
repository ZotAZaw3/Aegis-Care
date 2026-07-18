-- Phase 01 (Compliance Judge plan) — bảng audit mỗi lượt gác cổng y lệnh.
-- Ghi bởi route /api/compliance-judge (JWT staff). Bằng chứng "AI gác cổng" + audit trail.

CREATE TABLE IF NOT EXISTS public.compliance_judgments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_session_id uuid,
  patient_id       uuid,
  procedure_type   text,
  findings         jsonb NOT NULL,
  verdict          text,
  acked_by         uuid,
  ack_reasons      jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cj_patient ON public.compliance_judgments (patient_id);
CREATE INDEX IF NOT EXISTS idx_cj_visit   ON public.compliance_judgments (visit_session_id);

GRANT SELECT, INSERT, UPDATE ON public.compliance_judgments TO authenticated;
GRANT ALL ON public.compliance_judgments TO service_role;

ALTER TABLE public.compliance_judgments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cj staff read"   ON public.compliance_judgments;
DROP POLICY IF EXISTS "cj staff insert" ON public.compliance_judgments;
DROP POLICY IF EXISTS "cj staff update" ON public.compliance_judgments;
DROP POLICY IF EXISTS "cj service all"  ON public.compliance_judgments;

CREATE POLICY "cj staff read"   ON public.compliance_judgments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "cj staff insert" ON public.compliance_judgments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "cj staff update" ON public.compliance_judgments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "cj service all"  ON public.compliance_judgments FOR ALL    TO service_role USING (true) WITH CHECK (true);
