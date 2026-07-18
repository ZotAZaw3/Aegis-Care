-- Phase 02 (EMR Observations) — Lane-1 truy xuất observations.
-- CREATE OR REPLACE get_safety_panel: thêm khóa `observations` (mới nhất mỗi mã whitelist).
-- Thêm get_observation_history cho trang hồ sơ + copilot. SECURITY INVOKER (RLS staff-read lo).
-- Trình bày SỰ THẬT: value + đơn vị + ngày + ref range KB. KHÔNG phán bất thường. unit lấy từ whitelist (chuẩn hóa).

-- ============ Lane1: panel an toàn + observations (mới nhất/mã) ============
CREATE OR REPLACE FUNCTION public.get_safety_panel(p_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_allergies jsonb;
  v_meds      jsonb;
  v_flags     jsonb;
  v_obs       jsonb;
BEGIN
  -- Dị ứng: gộp patient_allergies (nhập lâm sàng) + emr_allergies (Synthea). Bỏ "Allergic disposition" chung.
  SELECT COALESCE(jsonb_agg(a), '[]'::jsonb) INTO v_allergies FROM (
    SELECT allergen AS label, severity::text AS severity, note, 'clinical'::text AS source
      FROM public.patient_allergies WHERE patient_id = p_patient_id
    UNION ALL
    SELECT description, severity, NULL::text, 'emr'::text
      FROM public.emr_allergies
      WHERE patient_id = p_patient_id AND description NOT ILIKE '%allergic disposition%'
  ) a;

  -- Thuốc ĐANG DÙNG (active).
  SELECT COALESCE(jsonb_agg(m), '[]'::jsonb) INTO v_meds FROM (
    SELECT DISTINCT description AS name, code AS rxnorm
      FROM public.emr_medications
      WHERE patient_id = p_patient_id AND (med_stop IS NULL OR med_stop > current_date)
  ) m;

  -- Cờ bệnh nền liên quan nha (KB định nghĩa, Graph truy xuất). Chỉ SỰ THẬT.
  SELECT COALESCE(jsonb_agg(f), '[]'::jsonb) INTO v_flags FROM (
    SELECT DISTINCT nf.label_vi, nf.label, nf.severity_hint, nf.match_kind AS matched_by
      FROM public.nka_systemic_flags nf
     WHERE nf.active AND (
       (nf.match_kind = 'medication_keyword' AND EXISTS (
          SELECT 1 FROM public.emr_medications em
           WHERE em.patient_id = p_patient_id
             AND (em.med_stop IS NULL OR em.med_stop > current_date)
             AND em.description ILIKE '%' || nf.match_value || '%'))
       OR (nf.match_kind = 'medication_rxnorm' AND EXISTS (
          SELECT 1 FROM public.emr_medications em
           WHERE em.patient_id = p_patient_id
             AND (em.med_stop IS NULL OR em.med_stop > current_date)
             AND em.code = nf.match_value))
       OR (nf.match_kind = 'condition_snomed' AND EXISTS (
          SELECT 1 FROM public.emr_conditions ec
           WHERE ec.patient_id = p_patient_id AND ec.code = nf.match_value))
     )
  ) f;

  -- Observations: giá trị MỚI NHẤT mỗi mã whitelist active. unit từ whitelist (chuẩn), ref range KB.
  SELECT COALESCE(jsonb_agg(x ORDER BY x.category, x.label_vi), '[]'::jsonb) INTO v_obs FROM (
    SELECT DISTINCT ON (o.loinc_code)
        o.loinc_code, w.label_vi, w.category, w.unit,
        o.value_num, o.value_text, o.observed_at::date AS observed_at,
        w.ref_low, w.ref_high, w.related_flag, w.relevance_vi
      FROM public.emr_observations o
      JOIN public.emr_observation_whitelist w ON w.loinc_code = o.loinc_code AND w.active
     WHERE o.patient_id = p_patient_id
     ORDER BY o.loinc_code, o.observed_at DESC
  ) x;

  RETURN jsonb_build_object(
    'allergies', v_allergies, 'medications', v_meds,
    'systemic_flags', v_flags, 'observations', v_obs
  );
END $$;

-- ============ Lịch sử observation (trang hồ sơ + copilot) ============
CREATE OR REPLACE FUNCTION public.get_observation_history(p_patient_id uuid, p_codes text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'loinc_code', o.loinc_code,
      'label_vi', w.label_vi,
      'value_num', o.value_num,
      'value_text', o.value_text,
      'unit', w.unit,
      'observed_at', o.observed_at::date,
      'ref_low', w.ref_low,
      'ref_high', w.ref_high
    ) ORDER BY o.observed_at DESC), '[]'::jsonb)
  FROM public.emr_observations o
  JOIN public.emr_observation_whitelist w ON w.loinc_code = o.loinc_code AND w.active
  WHERE o.patient_id = p_patient_id
    AND (p_codes IS NULL OR o.loinc_code = ANY(p_codes));
$$;

-- Grants: staff gọi được, chặn anon.
GRANT EXECUTE ON FUNCTION public.get_safety_panel(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_observation_history(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_observation_history(uuid, text[]) TO authenticated;
