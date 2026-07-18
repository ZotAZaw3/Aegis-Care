-- Phase 06 (EMR Observations) — Ops metric: BN chống đông thiếu INR.
-- CREATE OR REPLACE get_ops_metrics (bản mới nhất): thêm highlight anticoag_missing_inr.
-- Deterministic, đếm (KHÔNG %, KHÔNG khuyến nghị). LLM báo cáo Ops chỉ thuật con số này.
-- Định nghĩa chống đông DÙNG LẠI nka_systemic_flags (DRY). Toàn bộ function giữ nguyên part1 + 1 highlight.

CREATE OR REPLACE FUNCTION public.get_ops_metrics() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'period', jsonb_build_object('from', current_date, 'to', current_date),
    'patients', (
      SELECT jsonb_build_object(
        'total',                (SELECT count(*) FROM public.patients),
        'visits_today_waiting', count(*) FILTER (WHERE status IN ('pending','called')),
        'visits_today_in_exam', count(*) FILTER (WHERE status IN ('in_exam','waiting_lab','waiting_recall','finalizing')),
        'visits_today_done',    count(*) FILTER (WHERE status = 'done')
      )
      FROM public.visit_sessions WHERE created_at::date = current_date
    ),
    'orders', jsonb_build_object(
      'by_status', COALESCE((SELECT jsonb_object_agg(k, c) FROM (
                     SELECT status::text k, count(*) c FROM public.medical_orders GROUP BY status) s), '{}'::jsonb),
      'by_type',   COALESCE((SELECT jsonb_object_agg(k, c) FROM (
                     SELECT order_type::text k, count(*) c FROM public.medical_orders
                     WHERE status IN ('open','routed','in_progress','awaiting_review') GROUP BY order_type) s), '{}'::jsonb),
      'overdue',   (SELECT count(*) FROM public.medical_orders
                     WHERE status IN ('open','routed','in_progress','awaiting_review') AND due_at < now())
    ),
    'violations', jsonb_build_object(
      'total',   (SELECT count(*) FROM public.order_violations),
      'by_kind', COALESCE((SELECT jsonb_object_agg(violation_kind, c) FROM (
                   SELECT violation_kind, count(*) c FROM public.order_violations GROUP BY violation_kind) s), '{}'::jsonb),
      'by_role', COALESCE((SELECT jsonb_object_agg(k, c) FROM (
                   SELECT assigned_role::text k, count(*) c FROM public.order_violations GROUP BY assigned_role) s), '{}'::jsonb)
    ),
    'judge', jsonb_build_object(
      'today',        (SELECT count(*) FROM public.compliance_judgments WHERE created_at::date = current_date),
      'has_findings', (SELECT count(*) FROM public.compliance_judgments WHERE verdict = 'has_findings'),
      'unacked',      (SELECT count(*) FROM public.compliance_judgments
                        WHERE acked_by IS NULL AND jsonb_array_length(COALESCE(findings->'hard_findings','[]'::jsonb)) > 0)
    ),
    'workload', jsonb_build_object(
      'orders_open_by_role', COALESCE((SELECT jsonb_object_agg(k, c) FROM (
                               SELECT assigned_role::text k, count(*) c FROM public.medical_orders
                               WHERE status IN ('open','routed','in_progress','awaiting_review') GROUP BY assigned_role) s), '{}'::jsonb),
      'pending_review_by_dentist', COALESCE((SELECT jsonb_agg(jsonb_build_object('dentist', nm, 'count', c) ORDER BY c DESC) FROM (
                               SELECT COALESCE(st.full_name, '—') nm, count(*) c
                               FROM public.pending_review_orders pr
                               LEFT JOIN public.staff st ON st.id = pr.assigned_dentist_id
                               GROUP BY st.full_name) s), '[]'::jsonb)
    ),
    'delta', jsonb_build_object(
      'visits_today',             (SELECT count(*) FROM public.visit_sessions WHERE created_at::date = current_date),
      'visits_yesterday',         (SELECT count(*) FROM public.visit_sessions WHERE created_at::date = current_date - 1),
      'orders_closed_today',      (SELECT count(*) FROM public.medical_orders WHERE closed_at::date = current_date),
      'orders_closed_yesterday',  (SELECT count(*) FROM public.medical_orders WHERE closed_at::date = current_date - 1),
      'violations_new_today',     (SELECT count(*) FROM public.medical_orders
                                    WHERE due_at::date = current_date AND status IN ('open','routed','in_progress','awaiting_review')),
      'violations_new_yesterday', (SELECT count(*) FROM public.medical_orders
                                    WHERE due_at::date = current_date - 1 AND status IN ('open','routed','in_progress','awaiting_review'))
    ),
    'highlights', jsonb_build_object(
      'oldest_overdue_order', (SELECT jsonb_build_object('title', title, 'days_overdue', EXTRACT(day FROM now() - due_at)::int)
                                 FROM public.order_violations
                                 WHERE violation_kind = 'overdue_open' AND due_at IS NOT NULL
                                 ORDER BY due_at ASC LIMIT 1),
      'top_violation_role',   (SELECT jsonb_build_object('role', assigned_role::text, 'count', count(*))
                                 FROM public.order_violations GROUP BY assigned_role ORDER BY count(*) DESC LIMIT 1),
      'oldest_unacked_finding', (SELECT jsonb_build_object('procedure_type', procedure_type, 'days', EXTRACT(day FROM now() - created_at)::int)
                                 FROM public.compliance_judgments
                                 WHERE acked_by IS NULL AND jsonb_array_length(COALESCE(findings->'hard_findings','[]'::jsonb)) > 0
                                 ORDER BY created_at ASC LIMIT 1),
      'top_pending_review_dentist', (SELECT jsonb_build_object('dentist', COALESCE(st.full_name,'—'), 'count', count(*))
                                 FROM public.pending_review_orders pr
                                 LEFT JOIN public.staff st ON st.id = pr.assigned_dentist_id
                                 GROUP BY st.full_name ORDER BY count(*) DESC LIMIT 1),
      -- BN đang dùng chống đông/kháng tiểu cầu mà CHƯA TỪNG có INR ghi nhận (an toàn chảy máu).
      -- Production nên đổi thành ngưỡng thời gian (vd INR > 90 ngày); với seed lịch sử dùng "chưa từng" để số ổn định.
      'anticoag_missing_inr', (
        SELECT count(*) FROM (
          SELECT DISTINCT em.patient_id
          FROM public.emr_medications em
          JOIN public.nka_systemic_flags nf
            ON nf.active AND nf.match_kind = 'medication_keyword'
           AND (nf.label ILIKE 'anticoagulant%' OR nf.label ILIKE 'antiplatelet%')
           AND em.description ILIKE '%' || nf.match_value || '%'
          WHERE (em.med_stop IS NULL OR em.med_stop > current_date)
            AND NOT EXISTS (SELECT 1 FROM public.emr_observations o
                            WHERE o.patient_id = em.patient_id AND o.loinc_code = '6301-6')
        ) q
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ops_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ops_metrics() TO authenticated, service_role;
