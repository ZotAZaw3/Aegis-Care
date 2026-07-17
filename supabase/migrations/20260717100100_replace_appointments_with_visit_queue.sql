
-- Replaces the pre-booked Appointments/treatment_sessions/pipeline_status
-- model with the walk-in queue/visit-session model from the clinic's actual
-- patient-visit flow: reception issues a queue number (or a bed number for
-- emergency/inpatient patients) instead of booking a dated appointment; the
-- dentist and procedure are only known once the doctor examines the patient,
-- not at booking time.
--
-- This is a pre-launch project (all prior migrations are dated today) so we
-- drop and recreate the dependent tables (checklist_items, follow_ups,
-- alerts) against the new visit_sessions table rather than doing incremental
-- ALTERs — there is no production data to preserve.

-- ==== Make this migration safe to re-run ====
-- (in case an earlier attempt got partway through before failing — drop
-- everything this migration (re)creates, in dependency order, before
-- recreating it below)
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.follow_ups CASCADE;
DROP TABLE IF EXISTS public.checklist_items CASCADE;
DROP TABLE IF EXISTS public.lab_orders CASCADE;
DROP TABLE IF EXISTS public.visit_exam_rounds CASCADE;
DROP TABLE IF EXISTS public.visit_sessions CASCADE;
DROP TABLE IF EXISTS public.daily_session_counters CASCADE;

DROP FUNCTION IF EXISTS public.assign_session_number() CASCADE;
DROP FUNCTION IF EXISTS public.next_daily_session_number() CASCADE;
DROP FUNCTION IF EXISTS public.seed_checklist_on_procedure_set() CASCADE;
DROP FUNCTION IF EXISTS public.generate_followups_on_done() CASCADE;

DROP TYPE IF EXISTS public.visit_status;
DROP TYPE IF EXISTS public.lab_order_status;

-- ==== Drop the appointment-scheduling / pipeline-status model ====
-- CASCADE also drops checklist_items, follow_ups, alerts (they FK to
-- treatment_sessions); all three are recreated below against visit_sessions.
DROP TABLE IF EXISTS public.treatment_sessions CASCADE;
DROP TABLE IF EXISTS public.appointments CASCADE;

DROP FUNCTION IF EXISTS public.create_session_for_appointment();
DROP FUNCTION IF EXISTS public.check_appointment_conflict();
DROP FUNCTION IF EXISTS public.generate_followups_on_close();

DROP TYPE IF EXISTS public.appointment_status;
DROP TYPE IF EXISTS public.session_status;

-- ==== New enums ====
CREATE TYPE public.visit_status AS ENUM (
  'pending', 'called', 'in_exam', 'waiting_lab', 'waiting_recall', 'finalizing', 'transferred', 'done'
);
CREATE TYPE public.lab_order_status AS ENUM ('ordered', 'in_progress', 'completed');

-- ==== visit_sessions ====
CREATE TABLE public.visit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  session_number INT,
  bed_number TEXT,
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  status public.visit_status NOT NULL DEFAULT 'pending',
  current_round INT NOT NULL DEFAULT 1,
  root_session_id UUID REFERENCES public.visit_sessions(id),
  cycle_number INT NOT NULL DEFAULT 1,
  chief_complaint TEXT,
  assigned_dentist_id UUID REFERENCES public.staff(id),
  procedure_type public.procedure_type,
  diagnosis TEXT,
  treatment_plan TEXT,
  prescription TEXT,
  compliance_score NUMERIC(5,2),
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT visit_sessions_number_required CHECK (is_emergency OR session_number IS NOT NULL)
);

CREATE INDEX visit_sessions_status_idx ON public.visit_sessions (status);
CREATE INDEX visit_sessions_patient_idx ON public.visit_sessions (patient_id);
CREATE INDEX visit_sessions_root_idx ON public.visit_sessions (root_session_id);
CREATE INDEX visit_sessions_number_idx ON public.visit_sessions (session_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_sessions TO authenticated;
GRANT ALL ON public.visit_sessions TO service_role;
ALTER TABLE public.visit_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage visit sessions" ON public.visit_sessions
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ==== Daily 0-999 sequential numbering ====
CREATE TABLE public.daily_session_counters (
  counter_date DATE PRIMARY KEY,
  next_number INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.daily_session_counters TO authenticated;
GRANT ALL ON public.daily_session_counters TO service_role;
ALTER TABLE public.daily_session_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read counters" ON public.daily_session_counters
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_daily_session_number()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n INT;
BEGIN
  INSERT INTO public.daily_session_counters (counter_date, next_number)
  VALUES (current_date, 1)
  ON CONFLICT (counter_date) DO UPDATE
    SET next_number = public.daily_session_counters.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN n % 1000;
END;
$$;

-- Assigns the queue number on insert: emergency/inpatient rows use
-- bed_number instead (independent of the normal 0-999 queue); rows that
-- continue an existing cycle (root_session_id set) inherit the original
-- session's number/bed/emergency flag, matching "cycle1 #58, cycle2 #58".
CREATE OR REPLACE FUNCTION public.assign_session_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE root public.visit_sessions%ROWTYPE;
BEGIN
  IF NEW.root_session_id IS NOT NULL THEN
    SELECT * INTO root FROM public.visit_sessions WHERE id = NEW.root_session_id;
    NEW.session_number := root.session_number;
    NEW.bed_number := root.bed_number;
    NEW.is_emergency := root.is_emergency;
  ELSIF NOT NEW.is_emergency AND NEW.session_number IS NULL THEN
    NEW.session_number := public.next_daily_session_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_session_number
  BEFORE INSERT ON public.visit_sessions
  FOR EACH ROW EXECUTE FUNCTION public.assign_session_number();

-- ==== visit_exam_rounds (one row per doctor call/round) ====
CREATE TABLE public.visit_exam_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_session_id UUID NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  round_number INT NOT NULL DEFAULT 1,
  dentist_id UUID REFERENCES public.staff(id),
  called_at TIMESTAMPTZ,
  symptoms_note TEXT,
  crm_lookup_used BOOLEAN NOT NULL DEFAULT false,
  clinical_exam_note TEXT,
  needs_lab BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_session_id, round_number)
);
CREATE INDEX visit_exam_rounds_session_idx ON public.visit_exam_rounds (visit_session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_exam_rounds TO authenticated;
GRANT ALL ON public.visit_exam_rounds TO service_role;
ALTER TABLE public.visit_exam_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage exam rounds" ON public.visit_exam_rounds
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ==== lab_orders (lab technician self-check-off board) ====
CREATE TABLE public.lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_session_id UUID NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  round_number INT NOT NULL DEFAULT 1,
  ordered_by UUID REFERENCES public.staff(id),
  test_name TEXT NOT NULL,
  notes TEXT,
  status public.lab_order_status NOT NULL DEFAULT 'ordered',
  completed_by UUID REFERENCES public.staff(id),
  completed_at TIMESTAMPTZ,
  result_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lab_orders_session_idx ON public.lab_orders (visit_session_id);
CREATE INDEX lab_orders_status_idx ON public.lab_orders (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_orders TO authenticated;
GRANT ALL ON public.lab_orders TO service_role;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage lab orders" ON public.lab_orders
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ==== checklist_items (recreated against visit_sessions) ====
CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.checklist_rules(id),
  status public.checklist_item_status NOT NULL DEFAULT 'pending',
  completed_by UUID REFERENCES public.staff(id),
  completed_at TIMESTAMPTZ,
  exception_reason TEXT,
  exception_category public.exception_category
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage checklist items" ON public.checklist_items
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Checklist items used to be seeded when an appointment (with a known
-- procedure_type) was created. Procedure type is now only known once the
-- doctor finalizes the visit, so seeding moves to that point instead.
CREATE OR REPLACE FUNCTION public.seed_checklist_on_procedure_set()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.procedure_type IS NOT NULL AND OLD.procedure_type IS NULL THEN
    INSERT INTO public.checklist_items (session_id, rule_id)
    SELECT NEW.id, r.id
    FROM public.checklist_rules r
    WHERE r.procedure_type = NEW.procedure_type AND r.active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_checklist
  AFTER UPDATE OF procedure_type ON public.visit_sessions
  FOR EACH ROW EXECUTE FUNCTION public.seed_checklist_on_procedure_set();

-- ==== follow_ups (recreated against visit_sessions) ====
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  followup_type public.followup_type NOT NULL DEFAULT 'call',
  day_offset INT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  status public.followup_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  handled_by UUID REFERENCES public.staff(id),
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX follow_ups_due_date_idx ON public.follow_ups (due_date);
CREATE INDEX follow_ups_status_idx ON public.follow_ups (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage follow_ups" ON public.follow_ups
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ==== alerts (recreated against visit_sessions) ====
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity public.alert_severity NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  session_id UUID REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  followup_id UUID REFERENCES public.follow_ups(id) ON DELETE CASCADE,
  target_role public.app_role,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES public.staff(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage alerts" ON public.alerts
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ==== Follow-up auto-generation trigger (fires on visit completion) ====
CREATE OR REPLACE FUNCTION public.generate_followups_on_done()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE base TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    base := COALESCE(NEW.closed_at, now());

    IF NEW.procedure_type = 'extraction' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'call', 1, base + interval '1 day'),
        (NEW.id, 'review', 7, base + interval '7 days');
    ELSIF NEW.procedure_type = 'root_canal' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'call', 3, base + interval '3 days'),
        (NEW.id, 'review', 14, base + interval '14 days');
    ELSIF NEW.procedure_type = 'implant' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'call', 1, base + interval '1 day'),
        (NEW.id, 'call', 7, base + interval '7 days'),
        (NEW.id, 'review', 30, base + interval '30 days');
    ELSIF NEW.procedure_type = 'scaling' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'review', 7, base + interval '7 days');
    ELSIF NEW.procedure_type = 'filling' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'review', 7, base + interval '7 days');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_followups
  AFTER UPDATE OF status ON public.visit_sessions
  FOR EACH ROW EXECUTE FUNCTION public.generate_followups_on_done();

-- ==== Realtime ====
-- (DROP TABLE removed the old tables from the publication; re-add the
-- recreated ones plus the new visit-flow tables.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_exam_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_ups;
ALTER TABLE public.visit_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.visit_exam_rounds REPLICA IDENTITY FULL;
ALTER TABLE public.lab_orders REPLICA IDENTITY FULL;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER TABLE public.follow_ups REPLICA IDENTITY FULL;

-- ==== Lock down pure trigger functions ====
-- (never called directly by client code — matches the convention in
-- 20260717065500 for create_session_for_appointment/check_appointment_conflict)
REVOKE EXECUTE ON FUNCTION public.assign_session_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_daily_session_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_checklist_on_procedure_set() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_followups_on_done() FROM PUBLIC, anon, authenticated;
