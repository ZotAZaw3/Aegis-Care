-- Phase 01 (order-centric, ADDITIVE) — 4/4
-- Bảng chính sách deterministic + views vi phạm + storage buckets.
-- Red-team A1/A2/A5a: order_violations 2 nhánh (open-order theo due HOẶC vòng đời ca; consent-gate loại force).
-- Red-team B2: Lane1 seed cấp HOẠT CHẤT (không dùng tên nhóm "DOAC"/"bisphosphonate" — sẽ khớp 0).
--   Phase 03 mở rộng thêm RxNorm ingredient code + biệt dược còn thiếu.

-- ---------- Lane1: cờ bệnh nền phi-nha đổi cách làm răng ----------
CREATE TABLE public.nka_systemic_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  label_vi      text,
  match_kind    text NOT NULL,     -- 'condition_snomed' | 'medication_keyword' | 'medication_rxnorm'
  match_value   text NOT NULL,     -- mã SNOMED / keyword hoạt chất / RxNorm ingredient
  severity_hint text,
  active        boolean NOT NULL DEFAULT true
);

-- ---------- Lane2: whitelist SNOMED nha (Phase 03 trích từ 6 module JSON — để rỗng) ----------
CREATE TABLE public.dental_snomed_whitelist (
  code          text PRIMARY KEY,
  label         text,
  source_module text,
  kind          text               -- 'procedure' | 'condition'
);

-- Grants + RLS: staff read, admin write (chính sách)
GRANT SELECT ON public.nka_systemic_flags, public.dental_snomed_whitelist TO authenticated;
GRANT ALL ON public.nka_systemic_flags, public.dental_snomed_whitelist TO service_role;
ALTER TABLE public.nka_systemic_flags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dental_snomed_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read nka_flags"  ON public.nka_systemic_flags FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write nka_flags" ON public.nka_systemic_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff read snomed_wl"  ON public.dental_snomed_whitelist FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write snomed_wl" ON public.dental_snomed_whitelist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed Lane1 (B2: HOẠT CHẤT cụ thể, không tên nhóm). Phase 03 bổ sung RxNorm code + test-case.
INSERT INTO public.nka_systemic_flags (label, label_vi, match_kind, match_value, severity_hint) VALUES
  ('Anticoagulant: warfarin',    'Chống đông: warfarin',      'medication_keyword', 'warfarin',    'high'),
  ('Anticoagulant: apixaban',    'Chống đông: apixaban',      'medication_keyword', 'apixaban',    'high'),
  ('Anticoagulant: rivaroxaban', 'Chống đông: rivaroxaban',   'medication_keyword', 'rivaroxaban', 'high'),
  ('Anticoagulant: dabigatran',  'Chống đông: dabigatran',    'medication_keyword', 'dabigatran',  'high'),
  ('Anticoagulant: edoxaban',    'Chống đông: edoxaban',      'medication_keyword', 'edoxaban',    'high'),
  ('Anticoagulant: enoxaparin',  'Chống đông: enoxaparin',    'medication_keyword', 'enoxaparin',  'high'),
  ('Antiplatelet: clopidogrel',  'Kháng tiểu cầu: clopidogrel','medication_keyword','clopidogrel', 'high'),
  ('Antiplatelet: ticagrelor',   'Kháng tiểu cầu: ticagrelor','medication_keyword', 'ticagrelor',  'high'),
  ('Antiresorptive: alendronate','Bisphosphonate: alendronate','medication_keyword','alendron',    'high'),
  ('Antiresorptive: risedronate','Bisphosphonate: risedronate','medication_keyword','risedron',    'high'),
  ('Antiresorptive: ibandronate','Bisphosphonate: ibandronate','medication_keyword','ibandron',    'high'),
  ('Antiresorptive: zoledronic', 'Bisphosphonate: zoledronic','medication_keyword', 'zoledron',    'high'),
  ('Antiresorptive: pamidronate','Bisphosphonate: pamidronate','medication_keyword','pamidron',    'high'),
  ('Antiresorptive: denosumab',  'Kháng hủy xương: denosumab','medication_keyword', 'denosumab',   'high'),
  ('Diabetes mellitus type 2',   'Đái tháo đường type 2',     'condition_snomed',   '44054006',    'medium'),
  ('Pregnancy',                  'Thai kỳ',                   'condition_snomed',   '77386006',    'medium'),
  ('Blood coagulation disorder', 'Rối loạn đông máu',         'condition_snomed',   '64779008',    'high'),
  ('Immunosuppression',          'Suy giảm miễn dịch',        'condition_snomed',   '234532001',   'high');

-- ---------- View: danh sách vi phạm (KHÔNG số điểm — chỉ per-case) ----------
-- Nhánh 1 (A1+A2): order còn mở khi quá hạn HOẶC khi ca đã 'done' (bắt cả order due NULL).
-- Nhánh 2 (A5a): procedure đóng mà consent con chưa đóng, loại trừ force cấp cứu.
CREATE OR REPLACE VIEW public.order_violations
WITH (security_invoker = true) AS
  SELECT o.id, o.visit_session_id, o.patient_id, o.order_type, o.title,
         o.status, o.assigned_role, o.due_at, o.opened_at,
         CASE WHEN vs.status = 'done' THEN 'open_at_case_close'
              ELSE 'overdue_open' END AS violation_kind
  FROM public.medical_orders o
  JOIN public.visit_sessions vs ON vs.id = o.visit_session_id
  WHERE o.status IN ('open','routed','in_progress','awaiting_review')
    AND ( (o.due_at IS NOT NULL AND o.due_at < now()) OR vs.status = 'done' )
UNION ALL
  SELECT p.id, p.visit_session_id, p.patient_id, p.order_type, p.title,
         p.status, p.assigned_role, p.due_at, p.opened_at,
         'procedure_closed_consent_open' AS violation_kind
  FROM public.medical_orders p
  JOIN public.medical_orders c ON c.parent_order_id = p.id AND c.order_type = 'consent'
  LEFT JOIN public.consents cs ON cs.order_id = c.id
  WHERE p.status = 'closed' AND c.status <> 'closed'
    AND COALESCE(cs.force_emergency, false) = false;

-- View: hàng đợi "chờ tôi xem" của bác sĩ (kết quả thực thi xong chờ review).
CREATE OR REPLACE VIEW public.pending_review_orders
WITH (security_invoker = true) AS
  SELECT o.*, vs.assigned_dentist_id
  FROM public.medical_orders o
  JOIN public.visit_sessions vs ON vs.id = o.visit_session_id
  WHERE o.status = 'awaiting_review';

GRANT SELECT ON public.order_violations, public.pending_review_orders TO authenticated;

-- ---------- Storage buckets (private) ----------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('order-evidence', 'order-evidence', false),
  ('consent-scans',  'consent-scans',  false)
ON CONFLICT (id) DO NOTHING;

-- RLS storage.objects: chỉ staff (consent scan là PII nặng — KHÔNG public URL)
CREATE POLICY "staff manage order-evidence files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'order-evidence' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'order-evidence' AND public.is_staff(auth.uid()));
CREATE POLICY "staff manage consent-scan files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'consent-scans' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'consent-scans' AND public.is_staff(auth.uid()));
