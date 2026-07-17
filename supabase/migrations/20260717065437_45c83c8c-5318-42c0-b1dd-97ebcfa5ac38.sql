
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'dentist', 'assistant', 'receptionist');
CREATE TYPE public.procedure_type AS ENUM ('extraction', 'root_canal', 'scaling', 'implant', 'filling');
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.session_status AS ENUM ('scheduled', 'intake', 'pre_check', 'in_treatment', 'post_treatment', 'closed');
CREATE TYPE public.allergy_severity AS ENUM ('mild', 'moderate', 'severe');
CREATE TYPE public.checklist_timing AS ENUM ('before', 'during', 'after');
CREATE TYPE public.checklist_category AS ENUM ('documentation', 'clinical_step', 'infection_control', 'imaging', 'medication');
CREATE TYPE public.checklist_item_status AS ENUM ('pending', 'done', 'exception');

-- Staff profiles (no role stored here for security)
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  license_number TEXT,
  specialization TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- User roles (separate table — SECURITY CRITICAL)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

-- Staff RLS
CREATE POLICY "Staff can view all staff" ON public.staff FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Users can insert own staff row" ON public.staff FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own staff row" ON public.staff FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any staff" ON public.staff FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete staff" ON public.staff FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles RLS
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bootstrap: first user becomes admin automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.staff (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT NOT EXISTS(SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Patients
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  dob DATE,
  gender TEXT,
  phone TEXT,
  email TEXT,
  contact_prefs TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage patients" ON public.patients FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Allergies
CREATE TABLE public.patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  severity allergy_severity NOT NULL DEFAULT 'mild',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_allergies TO authenticated;
GRANT ALL ON public.patient_allergies TO service_role;
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage allergies" ON public.patient_allergies FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Checklist rules (seeded)
CREATE TABLE public.checklist_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type procedure_type NOT NULL,
  label TEXT NOT NULL,
  label_vi TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  assigned_role app_role NOT NULL,
  trigger_timing checklist_timing NOT NULL,
  category checklist_category NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.checklist_rules TO authenticated;
GRANT ALL ON public.checklist_rules TO service_role;
ALTER TABLE public.checklist_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read rules" ON public.checklist_rules FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage rules" ON public.checklist_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  dentist_id UUID NOT NULL REFERENCES public.staff(id),
  procedure_type procedure_type NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_mins INT NOT NULL DEFAULT 30,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage appointments" ON public.appointments FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX idx_appointments_dentist_time ON public.appointments (dentist_id, scheduled_at);

-- Treatment sessions
CREATE TABLE public.treatment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  pipeline_status session_status NOT NULL DEFAULT 'scheduled',
  compliance_score NUMERIC(5,2),
  primary_dentist_id UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_sessions TO authenticated;
GRANT ALL ON public.treatment_sessions TO service_role;
ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage sessions" ON public.treatment_sessions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Checklist items
CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.treatment_sessions(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.checklist_rules(id),
  status checklist_item_status NOT NULL DEFAULT 'pending',
  completed_by UUID REFERENCES public.staff(id),
  completed_at TIMESTAMPTZ,
  exception_reason TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage checklist items" ON public.checklist_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Auto-create session + checklist when appointment is created
CREATE OR REPLACE FUNCTION public.create_session_for_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_session_id UUID;
BEGIN
  INSERT INTO public.treatment_sessions (appointment_id, primary_dentist_id)
  VALUES (NEW.id, NEW.dentist_id)
  RETURNING id INTO new_session_id;

  INSERT INTO public.checklist_items (session_id, rule_id)
  SELECT new_session_id, r.id
  FROM public.checklist_rules r
  WHERE r.procedure_type = NEW.procedure_type AND r.active = true;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.create_session_for_appointment();

-- Conflict detection helper: prevent overlapping appointments for same dentist
CREATE OR REPLACE FUNCTION public.check_appointment_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.dentist_id = NEW.dentist_id
      AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND a.status <> 'cancelled'
      AND tstzrange(a.scheduled_at, a.scheduled_at + (a.duration_mins || ' minutes')::interval)
       && tstzrange(NEW.scheduled_at, NEW.scheduled_at + (NEW.duration_mins || ' minutes')::interval)
  ) THEN
    RAISE EXCEPTION 'Scheduling conflict: dentist already has an appointment at this time' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_appointment_conflict_trigger
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_conflict();

-- Seed checklist rules
INSERT INTO public.checklist_rules (procedure_type, label, label_vi, required, assigned_role, trigger_timing, category, sort_order) VALUES
-- Extraction
('extraction','Verify allergies','Kiểm tra dị ứng',true,'assistant','before','clinical_step',1),
('extraction','Record vitals','Ghi nhận sinh hiệu',true,'assistant','before','clinical_step',2),
('extraction','Confirm sterilization','Xác nhận tiệt trùng',true,'assistant','before','infection_control',3),
('extraction','Collect consent','Thu thập đồng thuận',true,'assistant','before','documentation',4),
('extraction','Review medical history','Xem xét tiền sử bệnh',true,'dentist','before','documentation',5),
('extraction','Confirm X-ray taken','Xác nhận đã chụp X-quang',true,'dentist','before','imaging',6),
('extraction','Write progress note','Ghi chú tiến trình',true,'dentist','during','documentation',7),
('extraction','Record prescribed medications','Ghi đơn thuốc',false,'dentist','after','medication',8),
('extraction','Provide post-care instructions','Hướng dẫn chăm sóc sau điều trị',true,'dentist','after','documentation',9),
-- Root canal
('root_canal','Verify allergies','Kiểm tra dị ứng',true,'assistant','before','clinical_step',1),
('root_canal','Record vitals','Ghi nhận sinh hiệu',true,'assistant','before','clinical_step',2),
('root_canal','Confirm sterilization','Xác nhận tiệt trùng',true,'assistant','before','infection_control',3),
('root_canal','Collect consent','Thu thập đồng thuận',true,'assistant','before','documentation',4),
('root_canal','Confirm X-ray taken','Xác nhận đã chụp X-quang',true,'dentist','before','imaging',5),
('root_canal','Anesthesia administered','Đã gây tê',true,'dentist','during','clinical_step',6),
('root_canal','Write progress note','Ghi chú tiến trình',true,'dentist','during','documentation',7),
('root_canal','Record prescribed medications','Ghi đơn thuốc',true,'dentist','after','medication',8),
('root_canal','Schedule follow-up','Đặt lịch tái khám',true,'dentist','after','documentation',9),
-- Scaling
('scaling','Verify allergies','Kiểm tra dị ứng',true,'assistant','before','clinical_step',1),
('scaling','Confirm sterilization','Xác nhận tiệt trùng',true,'assistant','before','infection_control',2),
('scaling','Collect consent','Thu thập đồng thuận',true,'assistant','before','documentation',3),
('scaling','Write progress note','Ghi chú tiến trình',true,'dentist','during','documentation',4),
('scaling','Provide oral hygiene instructions','Hướng dẫn vệ sinh răng miệng',true,'dentist','after','documentation',5),
-- Implant
('implant','Verify allergies','Kiểm tra dị ứng',true,'assistant','before','clinical_step',1),
('implant','Record vitals','Ghi nhận sinh hiệu',true,'assistant','before','clinical_step',2),
('implant','Confirm sterilization','Xác nhận tiệt trùng',true,'assistant','before','infection_control',3),
('implant','Collect consent','Thu thập đồng thuận',true,'assistant','before','documentation',4),
('implant','Review medical history','Xem xét tiền sử bệnh',true,'dentist','before','documentation',5),
('implant','Confirm CBCT / X-ray taken','Xác nhận đã chụp CBCT / X-quang',true,'dentist','before','imaging',6),
('implant','Anesthesia administered','Đã gây tê',true,'dentist','during','clinical_step',7),
('implant','Write progress note','Ghi chú tiến trình',true,'dentist','during','documentation',8),
('implant','Record prescribed medications','Ghi đơn thuốc',true,'dentist','after','medication',9),
('implant','Provide post-care instructions','Hướng dẫn chăm sóc sau điều trị',true,'dentist','after','documentation',10),
-- Filling
('filling','Verify allergies','Kiểm tra dị ứng',true,'assistant','before','clinical_step',1),
('filling','Confirm sterilization','Xác nhận tiệt trùng',true,'assistant','before','infection_control',2),
('filling','Collect consent','Thu thập đồng thuận',true,'assistant','before','documentation',3),
('filling','Confirm X-ray taken','Xác nhận đã chụp X-quang',false,'dentist','before','imaging',4),
('filling','Write progress note','Ghi chú tiến trình',true,'dentist','during','documentation',5),
('filling','Provide post-care instructions','Hướng dẫn chăm sóc sau điều trị',true,'dentist','after','documentation',6);
