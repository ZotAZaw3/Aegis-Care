-- Mở dashboard Ops + báo cáo cho BÁC SĨ (ngoài admin). Guard đổi has_role(admin) → has_ops_access.
-- has_ops_access = admin HOẶC dentist. DRY: 1 helper, thay guard ở mọi RPC/RLS Ops.

-- ---------- Helper quyền xem Ops ----------
CREATE OR REPLACE FUNCTION public.has_ops_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'dentist');
$$;
REVOKE ALL ON FUNCTION public.has_ops_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_ops_access(uuid) TO authenticated, service_role;

-- ---------- get_ops_metrics() (bản 100300 + guard has_ops_access) ----------
CREATE OR REPLACE FUNCTION public.get_ops_metrics() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_ops_access(auth.uid()) THEN
    RAISE EXCEPTION 'ops access required' USING ERRCODE = '42501';
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

-- ---------- get_ops_trends (bản 140000 + guard has_ops_access) ----------
CREATE OR REPLACE FUNCTION public.get_ops_trends(
  p_from date DEFAULT (current_date - 13),
  p_to   date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_ops_access(auth.uid()) THEN
    RAISE EXCEPTION 'ops access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', day, 'visits', visits, 'orders_created', orders_created,
           'orders_closed', orders_closed, 'judge_findings', judge_findings
         ) ORDER BY day), '[]'::jsonb) INTO result
  FROM (
    SELECT d::date AS day,
      (SELECT count(*) FROM public.visit_sessions   v WHERE v.created_at::date = d::date) AS visits,
      (SELECT count(*) FROM public.medical_orders   o WHERE o.created_at::date = d::date) AS orders_created,
      (SELECT count(*) FROM public.medical_orders   o WHERE o.closed_at::date  = d::date) AS orders_closed,
      (SELECT count(*) FROM public.compliance_judgments c
         WHERE c.created_at::date = d::date
           AND jsonb_array_length(COALESCE(c.findings->'hard_findings','[]'::jsonb)) > 0) AS judge_findings
    FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ) t;

  RETURN result;
END;
$$;

-- ---------- get_ops_stock_trend (bản 140100 + guard has_ops_access) ----------
CREATE OR REPLACE FUNCTION public.get_ops_stock_trend(
  p_from date DEFAULT (current_date - 13),
  p_to   date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_ops_access(auth.uid()) THEN
    RAISE EXCEPTION 'ops access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', day,
           'open_violations',  COALESCE((metrics->>'open_violations')::int, 0),
           'unacked_findings', COALESCE((metrics->>'unacked_findings')::int, 0),
           'orders_open',      COALESCE((metrics->>'orders_open')::int, 0)
         ) ORDER BY day), '[]'::jsonb) INTO result
  FROM public.ops_metrics_daily
  WHERE day BETWEEN p_from AND p_to;

  RETURN result;
END;
$$;

-- ---------- snapshot_ops_metrics (bản 140100 + guard: uid null HOẶC has_ops_access) ----------
CREATE OR REPLACE FUNCTION public.snapshot_ops_metrics()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE snap jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_ops_access(auth.uid()) THEN
    RAISE EXCEPTION 'ops access required' USING ERRCODE = '42501';
  END IF;

  snap := jsonb_build_object(
    'open_violations',  (SELECT count(*) FROM public.order_violations),
    'unacked_findings', (SELECT count(*) FROM public.compliance_judgments
                          WHERE acked_by IS NULL AND jsonb_array_length(COALESCE(findings->'hard_findings','[]'::jsonb)) > 0),
    'orders_open',      (SELECT count(*) FROM public.medical_orders
                          WHERE status IN ('open','routed','in_progress','awaiting_review'))
  );

  INSERT INTO public.ops_metrics_daily (day, metrics)
  VALUES (current_date, snap)
  ON CONFLICT (day) DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now();
END;
$$;

-- ---------- RLS: mở đọc/ghi ops_reports + đọc ops_metrics_daily cho has_ops_access ----------
DROP POLICY IF EXISTS "ops_reports admin read"   ON public.ops_reports;
DROP POLICY IF EXISTS "ops_reports admin insert" ON public.ops_reports;
CREATE POLICY "ops_reports ops read"   ON public.ops_reports FOR SELECT TO authenticated
  USING (public.has_ops_access(auth.uid()));
CREATE POLICY "ops_reports ops insert" ON public.ops_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_ops_access(auth.uid()));

DROP POLICY IF EXISTS "ops_daily admin read" ON public.ops_metrics_daily;
CREATE POLICY "ops_daily ops read" ON public.ops_metrics_daily FOR SELECT TO authenticated
  USING (public.has_ops_access(auth.uid()));
