
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_session_for_appointment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_appointment_conflict() FROM PUBLIC, anon, authenticated;
