-- P1 — Định tuyến theo PHÒNG BAN (trục department, tách khỏi app_role).
-- Additive: giữ nguyên assigned_role (chạy song song). department_id gán bởi route_order trigger
-- (fill-if-null) → phủ mọi đường insert: KB, custom, consent child, recall. DRY.
-- Migration áp tay qua Supabase SQL Editor.

-- ============ 1) departments ============
CREATE TABLE IF NOT EXISTS public.departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,          -- reception|treatment|imaging|lab|pharmacy
  name_vi    text NOT NULL,
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.departments (code, name_vi, name, sort_order) VALUES
  ('reception','Tiếp đón','Reception',1),
  ('treatment','Điều trị','Treatment',2),
  ('imaging','Chẩn đoán hình ảnh','Imaging',3),
  ('lab','Xét nghiệm','Laboratory',4),
  ('pharmacy','Dược','Pharmacy',5)
ON CONFLICT (code) DO NOTHING;

-- ============ 2) staff_departments (nhiều-nhiều) ============
CREATE TABLE IF NOT EXISTS public.staff_departments (
  staff_id      uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, department_id)
);

-- ============ 3) routing columns ============
ALTER TABLE public.kb_rules       ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);
ALTER TABLE public.medical_orders ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);
CREATE INDEX IF NOT EXISTS idx_orders_department ON public.medical_orders (department_id, status);

-- ============ 4) helper: order_type → department ============
CREATE OR REPLACE FUNCTION public.dept_id_for_order_type(p_ot public.order_type)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT id FROM public.departments WHERE code = CASE p_ot
    WHEN 'imaging'    THEN 'imaging'
    WHEN 'lab'        THEN 'lab'
    WHEN 'procedure'  THEN 'treatment'
    WHEN 'medication' THEN 'pharmacy'
    ELSE 'reception' END;   -- consent / follow_up / referral → reception
$$;

-- ============ 5) backfill ============
UPDATE public.kb_rules       SET department_id = public.dept_id_for_order_type(order_type) WHERE department_id IS NULL;
UPDATE public.medical_orders SET department_id = public.dept_id_for_order_type(order_type) WHERE department_id IS NULL;

-- staff_departments từ role hiện tại (dentist→treatment; lab_technician→lab; receptionist→reception; assistant→imaging)
INSERT INTO public.staff_departments (staff_id, department_id)
SELECT s.id, d.id
FROM public.staff s
JOIN public.user_roles ur ON ur.user_id = s.user_id
JOIN public.departments d ON d.code = CASE ur.role
  WHEN 'dentist'        THEN 'treatment'
  WHEN 'lab_technician' THEN 'lab'
  WHEN 'receptionist'   THEN 'reception'
  WHEN 'assistant'      THEN 'imaging' END
WHERE ur.role IN ('dentist','lab_technician','receptionist','assistant')
ON CONFLICT DO NOTHING;
-- assistant hỗ trợ cả ghế điều trị
INSERT INTO public.staff_departments (staff_id, department_id)
SELECT s.id, d.id
FROM public.staff s
JOIN public.user_roles ur ON ur.user_id = s.user_id AND ur.role = 'assistant'
JOIN public.departments d ON d.code = 'treatment'
ON CONFLICT DO NOTHING;

-- ============ 6) route_order: giữ logic cũ + gán department_id (fill-if-null) ============
CREATE OR REPLACE FUNCTION public.route_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'open' THEN
    NEW.status := 'routed';
  END IF;
  -- A1: mọi order có due (không tàng hình trước nhánh overdue)
  IF NEW.due_at IS NULL THEN
    NEW.due_at := NEW.opened_at + CASE NEW.order_type
      WHEN 'follow_up' THEN interval '7 days'
      WHEN 'referral'  THEN interval '48 hours'
      ELSE interval '24 hours'
    END;
  END IF;
  -- P1: đích định tuyến theo phòng (KB rule → else order_type map). Fill-if-null: không clobber.
  IF NEW.department_id IS NULL THEN
    IF NEW.kb_rule_id IS NOT NULL THEN
      SELECT department_id INTO NEW.department_id FROM public.kb_rules WHERE id = NEW.kb_rule_id;
    END IF;
    IF NEW.department_id IS NULL THEN
      NEW.department_id := public.dept_id_for_order_type(NEW.order_type);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ============ 7) get_my_departments(): phòng caller đang trực (nav/queue) ============
CREATE OR REPLACE FUNCTION public.get_my_departments()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.sort_order), '[]'::jsonb)
  FROM public.departments d
  WHERE d.active AND (
    public.has_role(auth.uid(), 'admin')                         -- admin thấy hết
    OR EXISTS (SELECT 1 FROM public.staff_departments sd
               JOIN public.staff s ON s.id = sd.staff_id
               WHERE s.user_id = auth.uid() AND sd.department_id = d.id)
  );
$$;

-- ============ 8) Grants + RLS ============
GRANT SELECT ON public.departments, public.staff_departments TO authenticated;
GRANT ALL    ON public.departments, public.staff_departments TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_departments()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.dept_id_for_order_type(public.order_type)     TO authenticated;
-- route_order là trigger fn: chặn client gọi trực tiếp (giữ pattern cũ).
REVOKE EXECUTE ON FUNCTION public.route_order() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.departments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read departments"  ON public.departments;
DROP POLICY IF EXISTS "admin write departments" ON public.departments;
CREATE POLICY "staff read departments"  ON public.departments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write departments" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "staff read staff_departments"  ON public.staff_departments;
DROP POLICY IF EXISTS "admin write staff_departments" ON public.staff_departments;
CREATE POLICY "staff read staff_departments"  ON public.staff_departments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write staff_departments" ON public.staff_departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
