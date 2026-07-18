-- Phase B — Customer Graph SỐNG (2/2): get_briefing_source bypass whitelist cho source='clinic'.
-- Dòng clinic không có mã SNOMED (code NULL) nhưng mặc nhiên là nha khoa → phải vào briefing.
-- CREATE OR REPLACE (không sửa migration cũ 20260718070000).
CREATE OR REPLACE FUNCTION public.get_briefing_source(p_patient_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH dental_enc AS (
    SELECT DISTINCT e.id, e.encounter_start::date AS enc_date, e.code, e.description, e.source
    FROM public.emr_encounters e
    WHERE e.patient_id = p_patient_id AND (
      e.source = 'clinic'                                                          -- bypass: clinic = nha khoa
      OR EXISTS (SELECT 1 FROM public.dental_snomed_whitelist w WHERE w.code = e.code)
      OR EXISTS (SELECT 1 FROM public.emr_conditions c
                 JOIN public.dental_snomed_whitelist w ON w.code = c.code WHERE c.encounter_id = e.id)
      OR EXISTS (SELECT 1 FROM public.emr_procedures pr
                 JOIN public.dental_snomed_whitelist w ON w.code = pr.code WHERE pr.encounter_id = e.id)
      OR EXISTS (SELECT 1 FROM public.emr_procedures pr2
                 WHERE pr2.encounter_id = e.id AND pr2.source = 'clinic')
    )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', de.id,
      'date', de.enc_date,
      'code', de.code,
      'description', de.description,
      'source', de.source,
      'conditions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', c.code, 'description', c.description)), '[]'::jsonb)
                     FROM public.emr_conditions c
                     WHERE c.encounter_id = de.id
                       AND (c.source = 'clinic'
                            OR EXISTS (SELECT 1 FROM public.dental_snomed_whitelist w WHERE w.code = c.code))),
      'procedures', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', pr.code, 'description', pr.description)), '[]'::jsonb)
                     FROM public.emr_procedures pr
                     WHERE pr.encounter_id = de.id
                       AND (pr.source = 'clinic'
                            OR EXISTS (SELECT 1 FROM public.dental_snomed_whitelist w WHERE w.code = pr.code)))
    ) ORDER BY de.enc_date), '[]'::jsonb)
  FROM dental_enc de;
$$;

GRANT EXECUTE ON FUNCTION public.get_briefing_source(uuid) TO authenticated;
