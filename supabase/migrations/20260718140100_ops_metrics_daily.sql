-- Phase 02 (AI Ops Report) — lịch sử STOCK (vi phạm treo / finding chưa ack tại ngày quá khứ).
-- View sống KHÔNG dựng lại được → snapshot 1 dòng/ngày. Flow đã có ở P01 (từ nguồn).
-- pg_cron daily (00:05). Fallback bắt buộc: route /api/ops-report gọi snapshot_ops_metrics() mỗi lần.

-- ---------- Bảng lịch sử stock (1 dòng/ngày, upsert theo day) ----------
CREATE TABLE IF NOT EXISTS public.ops_metrics_daily (
  day        date PRIMARY KEY,
  metrics    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ops_metrics_daily TO authenticated;
GRANT ALL    ON public.ops_metrics_daily TO service_role;
ALTER TABLE public.ops_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ops_daily admin read"   ON public.ops_metrics_daily;
DROP POLICY IF EXISTS "ops_daily service all"  ON public.ops_metrics_daily;
CREATE POLICY "ops_daily admin read"  ON public.ops_metrics_daily FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ops_daily service all" ON public.ops_metrics_daily FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------- snapshot_ops_metrics(): ghi STOCK hôm nay (idempotent upsert) ----------
-- SECURITY DEFINER: gọi bởi (a) cron — auth.uid() NULL; (b) route /api/ops-report dưới JWT admin.
-- Guard: cho phép nếu KHÔNG có auth context (cron/service) HOẶC caller là admin. Non-admin bị chặn.
CREATE OR REPLACE FUNCTION public.snapshot_ops_metrics()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE snap jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
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

-- Cho phép authenticated gọi (route admin dùng làm fallback); guard bên trong chặn non-admin. anon KHÔNG.
REVOKE ALL ON FUNCTION public.snapshot_ops_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_ops_metrics() TO authenticated, service_role;

-- ---------- get_ops_stock_trend(from,to): đọc lịch sử stock (admin-gated) ----------
CREATE OR REPLACE FUNCTION public.get_ops_stock_trend(
  p_from date DEFAULT (current_date - 13),
  p_to   date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.get_ops_stock_trend(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ops_stock_trend(date, date) TO authenticated, service_role;

-- ---------- pg_cron: snapshot hằng ngày 00:05 ----------
-- Nếu CREATE EXTENSION báo lỗi quyền: bật pg_cron ở Supabase Dashboard → Database → Extensions,
-- rồi chạy lại riêng khối cron.schedule bên dưới. Fallback route (P03) vẫn snapshot mỗi lần tạo báo cáo.
DO $cron$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('ops-daily-snapshot', '5 0 * * *', 'SELECT public.snapshot_ops_metrics();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron chưa bật (%). Dùng fallback snapshot-on-report ở /api/ops-report.', SQLERRM;
END;
$cron$;
