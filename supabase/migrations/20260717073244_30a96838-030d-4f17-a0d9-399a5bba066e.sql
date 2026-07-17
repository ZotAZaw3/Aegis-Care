
-- Enums
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE public.followup_status AS ENUM ('scheduled', 'contacted', 'completed', 'missed');
CREATE TYPE public.followup_type AS ENUM ('call', 'review');
CREATE TYPE public.exception_category AS ENUM ('patient_refusal', 'equipment_unavailable', 'clinical_contraindication', 'other');

-- Add exception_category column to checklist_items
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS exception_category public.exception_category;

-- ==== alerts ====
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity public.alert_severity NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  session_id uuid REFERENCES public.treatment_sessions(id) ON DELETE CASCADE,
  followup_id uuid,
  target_role public.app_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES public.staff(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage alerts" ON public.alerts
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ==== follow_ups ====
CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.treatment_sessions(id) ON DELETE CASCADE,
  followup_type public.followup_type NOT NULL DEFAULT 'call',
  day_offset int NOT NULL,
  due_date timestamptz NOT NULL,
  status public.followup_status NOT NULL DEFAULT 'scheduled',
  notes text,
  handled_by uuid REFERENCES public.staff(id),
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_ups_due_date_idx ON public.follow_ups(due_date);
CREATE INDEX follow_ups_status_idx ON public.follow_ups(status);

ALTER TABLE public.alerts ADD CONSTRAINT alerts_followup_id_fkey
  FOREIGN KEY (followup_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage follow_ups" ON public.follow_ups
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ==== Follow-up auto-generation trigger ====
CREATE OR REPLACE FUNCTION public.generate_followups_on_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proc public.procedure_type;
  base timestamptz;
BEGIN
  IF NEW.pipeline_status = 'closed' AND (OLD.pipeline_status IS DISTINCT FROM 'closed') THEN
    SELECT a.procedure_type INTO proc FROM public.appointments a WHERE a.id = NEW.appointment_id;
    base := COALESCE(NEW.closed_at, now());

    IF proc = 'extraction' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'call', 1, base + interval '1 day'),
        (NEW.id, 'review', 7, base + interval '7 days');
    ELSIF proc = 'root_canal' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'call', 3, base + interval '3 days'),
        (NEW.id, 'review', 14, base + interval '14 days');
    ELSIF proc = 'implant' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'call', 1, base + interval '1 day'),
        (NEW.id, 'call', 7, base + interval '7 days'),
        (NEW.id, 'review', 30, base + interval '30 days');
    ELSIF proc = 'scaling' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'review', 7, base + interval '7 days');
    ELSIF proc = 'filling' THEN
      INSERT INTO public.follow_ups (session_id, followup_type, day_offset, due_date) VALUES
        (NEW.id, 'review', 7, base + interval '7 days');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_followups
AFTER UPDATE OF pipeline_status ON public.treatment_sessions
FOR EACH ROW EXECUTE FUNCTION public.generate_followups_on_close();

-- ==== Overdue escalation ====
CREATE OR REPLACE FUNCTION public.escalate_overdue_followups()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT f.id, f.session_id
    FROM public.follow_ups f
    WHERE f.status = 'scheduled'
      AND f.due_date < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.alerts a
        WHERE a.followup_id = f.id AND a.dismissed_at IS NULL
      )
  LOOP
    INSERT INTO public.alerts (severity, message, session_id, followup_id, target_role)
    VALUES ('warning', 'Follow-up overdue', r.session_id, r.id, 'admin');
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.escalate_overdue_followups() TO authenticated;

-- ==== Realtime ====
ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_ups;
ALTER TABLE public.treatment_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER TABLE public.follow_ups REPLICA IDENTITY FULL;
