
-- Fix: a prior migration (20260717065500) revoked EXECUTE on has_role/is_staff
-- from `authenticated`. Both functions are called directly inside RLS USING/
-- WITH CHECK expressions on almost every table (patients, appointments,
-- treatment_sessions, checklist_rules, checklist_items, alerts, follow_ups,
-- staff, and user_roles itself). Postgres requires the querying role to hold
-- EXECUTE on any function referenced by an applicable policy, even ones that
-- ultimately don't match — so every authenticated query touching those
-- policies started failing with "permission denied for function", which the
-- client silently swallowed as "no rows" / "no role assigned".
--
-- create_session_for_appointment/check_appointment_conflict are pure trigger
-- functions (never called directly by client code), so they are intentionally
-- left revoked — trigger firing does not require EXECUTE on the trigger
-- function for the invoking role.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
