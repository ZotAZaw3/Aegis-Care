-- Phase 04 — nguồn dữ liệu briefing (Lane2): bệnh sử NHA (lọc dental_snomed_whitelist).
-- SECURITY INVOKER → RLS staff-read của emr_* áp dụng (edge function gọi bằng JWT người dùng).
-- Trả encounter nha (có mã nha HOẶC chứa condition/procedure nha), nested condition/procedure nha, theo thời gian.
CREATE OR REPLACE FUNCTION public.get_briefing_source(p_patient_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH dental_enc AS (
    SELECT DISTINCT e.id, e.encounter_start::date AS enc_date, e.code, e.description
    FROM public.emr_encounters e
    WHERE e.patient_id = p_patient_id AND (
      EXISTS (SELECT 1 FROM public.dental_snomed_whitelist w WHERE w.code = e.code)
      OR EXISTS (SELECT 1 FROM public.emr_conditions c
                 JOIN public.dental_snomed_whitelist w ON w.code = c.code WHERE c.encounter_id = e.id)
      OR EXISTS (SELECT 1 FROM public.emr_procedures pr
                 JOIN public.dental_snomed_whitelist w ON w.code = pr.code WHERE pr.encounter_id = e.id)
    )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', de.id,
      'date', de.enc_date,
      'code', de.code,
      'description', de.description,
      'conditions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', c.code, 'description', c.description)), '[]'::jsonb)
                     FROM public.emr_conditions c
                     JOIN public.dental_snomed_whitelist w ON w.code = c.code
                     WHERE c.encounter_id = de.id),
      'procedures', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', pr.code, 'description', pr.description)), '[]'::jsonb)
                     FROM public.emr_procedures pr
                     JOIN public.dental_snomed_whitelist w ON w.code = pr.code
                     WHERE pr.encounter_id = de.id)
    ) ORDER BY de.enc_date), '[]'::jsonb)
  FROM dental_enc de;
$$;

GRANT EXECUTE ON FUNCTION public.get_briefing_source(uuid) TO authenticated;
