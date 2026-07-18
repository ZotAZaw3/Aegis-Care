-- Phase 01 (AI Ops Report) — 2 RPC tất định, read-only, admin-gated.
-- Nền SỰ THẬT cho dashboard + báo cáo vận hành. LLM KHÔNG tính số — chỉ đọc 2 hàm này.
-- SECURITY INVOKER (RLS áp cho caller) + guard has_role('admin') RAISE nếu không phải admin.
-- FLOW (trend) = COUNT theo ngày từ nguồn có timestamp. STOCK (snapshot) = count as-of-now.
-- KHÔNG compliance_score: chỉ đếm + Δ (đếm hôm nay vs hôm qua), KHÔNG %.

-- ============================================================
-- get_ops_metrics() → snapshot jsonb HIỆN TẠI + Δ (hôm nay vs hôm qua) + highlights
-- KHÔNG nhận khoảng thời gian: snapshot luôn là "bây giờ" (stock as-of-now, flow today).
-- Chiều lịch sử/xu hướng nằm ở get_ops_trends / get_ops_stock_trend.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ops_metrics() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  -- Chặn non-admin authenticated. KHÔNG auth context (service_role/cron) → tin cậy, cho qua.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'period', jsonb_build_object('from', current_date, 'to', current_date),

    -- Bệnh nhân: tổng + visit hôm nay theo nhóm trạng thái
    'patients', (
      SELECT jsonb_build_object(
        'total',                (SELECT count(*) FROM public.patients),
        'visits_today_waiting', count(*) FILTER (WHERE status IN ('pending','called')),
        'visits_today_in_exam', count(*) FILTER (WHERE status IN ('in_exam','waiting_lab','waiting_recall','finalizing')),
        'visits_today_done',    count(*) FILTER (WHERE status = 'done')
      )
      FROM public.visit_sessions WHERE created_at::date = current_date
    ),

    -- Y lệnh: đếm theo status (tất cả), theo order_type (đang mở), số quá hạn
    'orders', jsonb_build_object(
      'by_status', COALESCE((SELECT jsonb_object_agg(k, c) FROM (
                     SELECT status::text k, count(*) c FROM public.medical_orders GROUP BY status) s), '{}'::jsonb),
      'by_type',   COALESCE((SELECT jsonb_object_agg(k, c) FROM (
                     SELECT order_type::text k, count(*) c FROM public.medical_orders
                     WHERE status IN ('open','routed','in_progress','awaiting_review') GROUP BY order_type) s), '{}'::jsonb),
      'overdue',   (SELECT count(*) FROM public.medical_orders
                     WHERE status IN ('open','routed','in_progress','awaiting_review') AND due_at < now())
    ),

    -- Vi phạm treo (từ view order_violations): tổng + theo loại + theo vai
    'violations', jsonb_build_object(
      'total',   (SELECT count(*) FROM public.order_violations),
      'by_kind', COALESCE((SELECT jsonb_object_agg(violation_kind, c) FROM (
                   SELECT violation_kind, count(*) c FROM public.order_violations GROUP BY violation_kind) s), '{}'::jsonb),
      'by_role', COALESCE((SELECT jsonb_object_agg(k, c) FROM (
                   SELECT assigned_role::text k, count(*) c FROM public.order_violations GROUP BY assigned_role) s), '{}'::jsonb)
    ),

    -- Compliance Judge: lượt hôm nay, số verdict có findings, số chưa ack (có hard_findings)
    'judge', jsonb_build_object(
      'today',        (SELECT count(*) FROM public.compliance_judgments WHERE created_at::date = current_date),
      'has_findings', (SELECT count(*) FROM public.compliance_judgments WHERE verdict = 'has_findings'),
      'unacked',      (SELECT count(*) FROM public.compliance_judgments
                        WHERE acked_by IS NULL AND jsonb_array_length(COALESCE(findings->'hard_findings','[]'::jsonb)) > 0)
    ),

    -- Khối lượng: y lệnh mở theo vai + pending_review theo bác sĩ (join tên)
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

    -- Δ (flow) hôm nay vs hôm qua — đếm, KHÔNG %
    'delta', jsonb_build_object(
      'visits_today',             (SELECT count(*) FROM public.visit_sessions WHERE created_at::date = current_date),
      'visits_yesterday',         (SELECT count(*) FROM public.visit_sessions WHERE created_at::date = current_date - 1),
      'orders_closed_today',      (SELECT count(*) FROM public.medical_orders WHERE closed_at::date = current_date),
      'orders_closed_yesterday',  (SELECT count(*) FROM public.medical_orders WHERE closed_at::date = current_date - 1),
      -- violations_new = y lệnh có hạn rơi vào ngày đó mà đến giờ VẪN chưa đóng (mới quá hạn còn treo)
      'violations_new_today',     (SELECT count(*) FROM public.medical_orders
                                    WHERE due_at::date = current_date AND status IN ('open','routed','in_progress','awaiting_review')),
      'violations_new_yesterday', (SELECT count(*) FROM public.medical_orders
                                    WHERE due_at::date = current_date - 1 AND status IN ('open','routed','in_progress','awaiting_review'))
    ),

    -- highlights: thực thể nổi bật TẤT ĐỊNH cho "vấn đề nổi bật" của báo cáo (LLM chỉ thuật lại, không tự chọn)
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
                                 GROUP BY st.full_name ORDER BY count(*) DESC LIMIT 1)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- get_ops_trends(from,to) → mảng jsonb theo ngày (FLOW), không hụt ngày trống
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ops_trends(
  p_from date DEFAULT (current_date - 13),
  p_to   date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  -- Chặn non-admin authenticated. KHÔNG auth context (service_role/cron) → tin cậy, cho qua.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', day,
           'visits', visits,
           'orders_created', orders_created,
           'orders_closed', orders_closed,
           'judge_findings', judge_findings
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

-- ---------- Grants: authenticated + service_role gọi được; anon KHÔNG ----------
REVOKE ALL ON FUNCTION public.get_ops_metrics()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ops_trends(date, date)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ops_metrics()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ops_trends(date, date)  TO authenticated, service_role;
