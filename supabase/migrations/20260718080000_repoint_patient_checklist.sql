-- Phase 11 — repoint get_patient_checklist từ lab_orders (model cũ) sang medical_orders.
-- /my-checklist là link công khai (anon) hiển thị checklist xét nghiệm/chụp phim của 1 ca.
-- Đổi return type (lab_order_status → text) nên phải DROP trước khi CREATE.
DROP FUNCTION IF EXISTS public.get_patient_checklist(uuid);

CREATE FUNCTION public.get_patient_checklist(p_session_id uuid)
RETURNS TABLE (
  session_number int,
  bed_number     text,
  cycle_number   int,
  patient_name   text,
  test_name      text,
  status         text,
  round_number   int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    vs.session_number,
    vs.bed_number,
    vs.cycle_number,
    p.full_name,
    o.title,
    CASE WHEN o.status = 'closed' THEN 'completed' ELSE 'ordered' END,
    1
  FROM public.visit_sessions vs
  JOIN public.patients p ON p.id = vs.patient_id
  LEFT JOIN public.medical_orders o
    ON o.visit_session_id = vs.id AND o.order_type IN ('lab','imaging')
  WHERE vs.id = p_session_id
  ORDER BY o.opened_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_patient_checklist(uuid) TO anon, authenticated;
