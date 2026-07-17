-- Phase 03 — Customer Graph read layer (RPC đọc, deterministic).
-- Lane1 get_safety_panel: TOÀN THÂN, hard-query, KHÔNG LLM (đường an toàn bệnh nhân).
-- Lane3 get_crm_recall: thuần nha (lọc dental_snomed_whitelist).
-- Cả hai SECURITY DEFINER + is_staff guard + search_path.

-- ============ Lane1: panel an toàn (dị ứng + thuốc đang dùng + bệnh nền liên quan) ============
-- SECURITY INVOKER (mặc định): RLS staff-read của emr_*/nka_systemic_flags áp dụng →
-- staff thấy, non-staff rỗng, editor superuser bypass (test được). Không cần guard, không probe được.
CREATE OR REPLACE FUNCTION public.get_safety_panel(p_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_allergies jsonb;
  v_meds      jsonb;
  v_flags     jsonb;
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

  -- Thuốc ĐANG DÙNG (active = chưa dừng hoặc dừng ở tương lai). Ưu tiên hiện thừa hơn sót.
  SELECT COALESCE(jsonb_agg(m), '[]'::jsonb) INTO v_meds FROM (
    SELECT DISTINCT description AS name, code AS rxnorm
      FROM public.emr_medications
      WHERE patient_id = p_patient_id AND (med_stop IS NULL OR med_stop > current_date)
  ) m;

  -- Cờ bệnh nền liên quan nha — KB định nghĩa danh sách, Graph truy xuất BN có trong danh sách không.
  -- Chỉ đẩy SỰ THẬT (bệnh nhân có X), KHÔNG phán "nên làm gì" (inference = cấm).
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

  RETURN jsonb_build_object('allergies', v_allergies, 'medications', v_meds, 'systemic_flags', v_flags);
END $$;

-- ============ Lane3: CRM / recall (thuần nha) ============
CREATE OR REPLACE FUNCTION public.get_crm_recall(p_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$   -- SECURITY INVOKER (RLS staff-read lo)
DECLARE
  v_last      date;
  v_followups jsonb;
  v_procs     jsonb;
BEGIN
  -- Lần khám nha gần nhất: encounter có code ∈ whitelist HOẶC cơ sở nha khoa/RHM.
  SELECT max(e.encounter_start::date) INTO v_last
    FROM public.emr_encounters e
   WHERE e.patient_id = p_patient_id
     AND ( EXISTS (SELECT 1 FROM public.dental_snomed_whitelist w WHERE w.code = e.code)
           OR e.organization ILIKE '%Nha khoa%' OR e.organization ILIKE '%Răng Hàm Mặt%' );

  -- Follow_up order đang treo (từ trục y lệnh).
  SELECT COALESCE(jsonb_agg(o), '[]'::jsonb) INTO v_followups FROM (
    SELECT id, title, due_at, status
      FROM public.medical_orders
     WHERE patient_id = p_patient_id AND order_type = 'follow_up' AND status NOT IN ('closed','cancelled')
     ORDER BY due_at
  ) o;

  -- Thủ thuật nha đã làm (∩ whitelist), 20 gần nhất.
  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) INTO v_procs FROM (
    SELECT ep.code, ep.description, ep.performed_at
      FROM public.emr_procedures ep
      JOIN public.dental_snomed_whitelist w ON w.code = ep.code
     WHERE ep.patient_id = p_patient_id
     ORDER BY ep.performed_at DESC
     LIMIT 20
  ) p;

  RETURN jsonb_build_object('last_dental_encounter', v_last, 'open_followups', v_followups, 'dental_procedures', v_procs);
END $$;

-- Grants: staff gọi được, chặn anon.
REVOKE EXECUTE ON FUNCTION public.get_safety_panel(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_crm_recall(uuid)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_safety_panel(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_crm_recall(uuid)   TO authenticated;
