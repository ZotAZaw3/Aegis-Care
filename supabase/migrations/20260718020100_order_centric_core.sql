-- Phase 01 (order-centric, ADDITIVE) — 2/4
-- Trục Y LỆNH: medical_orders + order_evidence + consents + kb_rules.
-- ADDITIVE: KHÔNG drop model rounds/lab/checklist cũ (giữ tới Phase 11) → branch build được.
-- Red-team fixes: kb_rules.needs_review (A2); consents KHÔNG có procedure_type (A5b — đọc từ order con);
--   medical_orders.cancel_reason/cancelled_by (A3 — hủy phải có lý do).

-- ---------- Enums ----------
CREATE TYPE public.order_type       AS ENUM ('imaging','lab','procedure','medication','follow_up','referral','consent');
CREATE TYPE public.order_status     AS ENUM ('open','routed','in_progress','awaiting_review','closed','cancelled');
CREATE TYPE public.order_close_mode AS ENUM ('invariant','evidence','manual');
CREATE TYPE public.evidence_type    AS ENUM ('file_upload','appointment','consent_scan','record','manual_tick');
CREATE TYPE public.consent_signer   AS ENUM ('patient','guardian');

-- ---------- kb_rules (tạo trước vì medical_orders FK tới) ----------
CREATE TABLE public.kb_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type   public.procedure_type NOT NULL,
  order_type       public.order_type NOT NULL,
  title            text NOT NULL,
  title_vi         text,
  detail           text,
  assigned_role    public.app_role NOT NULL,
  mandatory        boolean NOT NULL DEFAULT true,
  requires_consent boolean NOT NULL DEFAULT false,
  needs_review     boolean NOT NULL DEFAULT false,          -- A2: Phase 05 trigger đọc cột này
  close_mode       public.order_close_mode NOT NULL DEFAULT 'evidence',
  due_offset_hours int,
  sort_order       int DEFAULT 0,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kb_rules_procedure ON public.kb_rules (procedure_type) WHERE active;

-- ---------- medical_orders (trục) ----------
CREATE TABLE public.medical_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_session_id uuid NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES public.patients(id),          -- denorm cho query nhanh
  parent_order_id  uuid REFERENCES public.medical_orders(id) ON DELETE CASCADE, -- consent gate = con
  order_type       public.order_type NOT NULL,
  procedure_type   public.procedure_type,                                 -- procedure/consent scope-match
  title            text NOT NULL,
  detail           text,
  ordered_by       uuid REFERENCES public.staff(id),                      -- chữ ký bác sĩ = thẩm quyền
  assigned_role    public.app_role NOT NULL,                              -- route tới hàng đợi vai nào
  status           public.order_status NOT NULL DEFAULT 'open',
  close_mode       public.order_close_mode NOT NULL DEFAULT 'evidence',
  due_at           timestamptz,                                           -- quá hạn + open = vi phạm
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  closed_by        uuid REFERENCES public.staff(id),
  kb_rule_id       uuid REFERENCES public.kb_rules(id),
  is_kb_mandatory  boolean NOT NULL DEFAULT false,                        -- xoá bước buộc → cần exception
  exception_reason text,                                                  -- ghi khi xoá bước KB buộc
  cancel_reason    text,                                                  -- A3: hủy phải có lý do
  cancelled_by     uuid REFERENCES public.staff(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_needs_parent CHECK (order_type <> 'consent' OR parent_order_id IS NOT NULL),
  CONSTRAINT cancel_needs_reason  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX idx_orders_status        ON public.medical_orders (status);
CREATE INDEX idx_orders_role_status   ON public.medical_orders (assigned_role, status);
CREATE INDEX idx_orders_patient       ON public.medical_orders (patient_id);
CREATE INDEX idx_orders_visit         ON public.medical_orders (visit_session_id);
CREATE INDEX idx_orders_due           ON public.medical_orders (due_at);
CREATE INDEX idx_orders_parent        ON public.medical_orders (parent_order_id);

-- ---------- consents (gate detail; A5b: KHÔNG procedure_type, đọc từ order con) ----------
CREATE TABLE public.consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL UNIQUE REFERENCES public.medical_orders(id) ON DELETE CASCADE,
  scan_path       text,                                    -- storage: consent-scans (KHÔNG e-signature)
  signer          public.consent_signer,
  signed_date     date,
  force_emergency boolean NOT NULL DEFAULT false,
  force_reason    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT force_needs_reason CHECK (NOT force_emergency OR force_reason IS NOT NULL)
);

-- ---------- order_evidence ----------
CREATE TABLE public.order_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.medical_orders(id) ON DELETE CASCADE,
  evidence_type public.evidence_type NOT NULL,
  file_path     text,                                      -- storage: order-evidence
  followup_ref  uuid,                                      -- nếu evidence = lịch hẹn recall
  consent_id    uuid REFERENCES public.consents(id),
  note          text,
  submitted_by  uuid REFERENCES public.staff(id),
  submitted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidence_order ON public.order_evidence (order_id);

-- ---------- alerts: thêm order_id (repoint sang trục y lệnh) ----------
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.medical_orders(id) ON DELETE CASCADE;

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_rules, public.medical_orders, public.consents, public.order_evidence TO authenticated;
GRANT ALL ON public.kb_rules, public.medical_orders, public.consents, public.order_evidence TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.kb_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_evidence ENABLE ROW LEVEL SECURITY;

-- medical_orders / consents / order_evidence: blanket staff read-write
CREATE POLICY "staff manage orders"   ON public.medical_orders FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff manage consents" ON public.consents FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff manage evidence" ON public.order_evidence FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- kb_rules: staff read, admin write (chính sách)
CREATE POLICY "staff read kb_rules"  ON public.kb_rules FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write kb_rules" ON public.kb_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- Realtime (alerts + visit_sessions đã ở publication từ migration cũ) ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_evidence;
ALTER TABLE public.medical_orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_evidence REPLICA IDENTITY FULL;
