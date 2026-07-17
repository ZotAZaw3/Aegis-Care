
-- Public, no-login "patient checklist" link: /my-checklist/{visit_session_id}.
-- Patients are not app users (no auth.users row, no role), so this cannot be
-- gated by the usual is_staff()/has_role() RLS policies — those only ever
-- grant access to logged-in staff. Instead of opening a broad anon SELECT
-- policy on visit_sessions/lab_orders (which would let anyone holding the
-- anon key enumerate every patient's data), expose a single SECURITY DEFINER
-- function that only returns the specific whitelisted columns a patient is
-- meant to see for the one session id they were given — nothing else on the
-- row (no diagnosis, no other patients, no way to list sessions).
CREATE OR REPLACE FUNCTION public.get_patient_checklist(p_session_id uuid)
RETURNS TABLE (
  session_number int,
  bed_number text,
  cycle_number int,
  patient_name text,
  test_name text,
  status public.lab_order_status,
  round_number int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    vs.session_number,
    vs.bed_number,
    vs.cycle_number,
    p.full_name,
    lo.test_name,
    lo.status,
    lo.round_number
  FROM public.visit_sessions vs
  JOIN public.patients p ON p.id = vs.patient_id
  LEFT JOIN public.lab_orders lo ON lo.visit_session_id = vs.id
  WHERE vs.id = p_session_id
  ORDER BY lo.round_number, lo.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_patient_checklist(uuid) TO anon, authenticated;
