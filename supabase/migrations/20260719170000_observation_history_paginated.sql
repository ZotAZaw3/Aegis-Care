-- RPC phân trang riêng cho trang hồ sơ BN (LabsHistory). Không đụng get_observation_history
-- (copilot patient_labs vẫn gọi bản không giới hạn cũ, giữ nguyên hành vi).
CREATE OR REPLACE FUNCTION public.get_observation_history_page(
  p_patient_id uuid, p_codes text[] DEFAULT NULL, p_limit int DEFAULT 20, p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH base AS (
    SELECT o.loinc_code, w.label_vi, o.value_num, o.value_text, w.unit,
           o.observed_at::date AS observed_at, w.ref_low, w.ref_high,
           count(*) OVER() AS total_count
    FROM public.emr_observations o
    JOIN public.emr_observation_whitelist w ON w.loinc_code = o.loinc_code AND w.active
    WHERE o.patient_id = p_patient_id
      AND (p_codes IS NULL OR o.loinc_code = ANY(p_codes))
    ORDER BY o.observed_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(jsonb_agg(jsonb_build_object(
        'loinc_code', loinc_code, 'label_vi', label_vi, 'value_num', value_num, 'value_text', value_text,
        'unit', unit, 'observed_at', observed_at, 'ref_low', ref_low, 'ref_high', ref_high
      ) ORDER BY observed_at DESC), '[]'::jsonb),
    'total', COALESCE((SELECT MAX(total_count) FROM base), 0)
  )
  FROM base;
$$;

REVOKE EXECUTE ON FUNCTION public.get_observation_history_page(uuid, text[], int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_observation_history_page(uuid, text[], int, int) TO authenticated;
