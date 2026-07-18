// Phase 05 (AI Ops Report) — verify RPC tất định khớp query tay + trend đủ ngày + snapshot idempotent.
// Chạy: node scripts/verify-ops-metrics.mjs  (cần migration 140000/140100/140200 đã áp).
// Dùng service_role → auth.uid() NULL → RPC bỏ qua guard admin (đúng thiết kế: server tin cậy).
import { createClient } from '@supabase/supabase-js';
import { loadKbEnv } from './_kb-env.mjs';

const HANGING = ['open', 'routed', 'in_progress', 'awaiting_review'];

function hardFindingsLen(findings) {
  const hf = findings && findings.hard_findings;
  return Array.isArray(hf) ? hf.length : 0;
}

async function main() {
  const { serviceKey, supabaseUrl } = loadKbEnv();
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let pass = 0, fail = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    ok ? pass++ : fail++;
  };

  // ---- RPC snapshot ----
  const { data: metrics, error: mErr } = await sb.rpc('get_ops_metrics');
  if (mErr) { console.error('get_ops_metrics lỗi:', mErr.message); process.exit(1); }

  // ---- Kịch bản 1: KPI stock khớp query tay (timezone-independent) ----
  const { count: violTotal } = await sb.from('order_violations').select('*', { count: 'exact', head: true });
  check('violations.total = order_violations count', metrics.violations.total === (violTotal ?? 0),
    `rpc=${metrics.violations.total} hand=${violTotal}`);

  const { count: overdue } = await sb.from('medical_orders')
    .select('*', { count: 'exact', head: true })
    .in('status', HANGING).lt('due_at', new Date().toISOString());
  check('orders.overdue = hand count', metrics.orders.overdue === (overdue ?? 0),
    `rpc=${metrics.orders.overdue} hand=${overdue}`);

  const { data: cjRows } = await sb.from('compliance_judgments').select('findings').is('acked_by', null);
  const unacked = (cjRows ?? []).filter((r) => hardFindingsLen(r.findings) > 0).length;
  check('judge.unacked = hand count', metrics.judge.unacked === unacked,
    `rpc=${metrics.judge.unacked} hand=${unacked}`);

  check('patients.total là số ≥ 0', typeof metrics.patients.total === 'number' && metrics.patients.total >= 0,
    `total=${metrics.patients.total}`);
  check('highlights có mặt', metrics.highlights !== undefined, JSON.stringify(metrics.highlights).slice(0, 120));

  // ---- Kịch bản 2: trend không hụt ngày (15 phần tử cho 14 ngày lùi) ----
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: trend, error: tErr } = await sb.rpc('get_ops_trends', { p_from: from, p_to: today });
  if (tErr) { console.error('get_ops_trends lỗi:', tErr.message); process.exit(1); }
  check('trend = 15 phần tử (không hụt ngày trống)', Array.isArray(trend) && trend.length === 15,
    `len=${trend?.length}`);

  // ---- Kịch bản 5: snapshot idempotent (2 lần → 1 dòng/ngày) ----
  const s1 = await sb.rpc('snapshot_ops_metrics');
  const s2 = await sb.rpc('snapshot_ops_metrics');
  if (s1.error || s2.error) {
    check('snapshot_ops_metrics chạy được', false, (s1.error || s2.error).message);
  } else {
    const { count: dayRows } = await sb.from('ops_metrics_daily')
      .select('*', { count: 'exact', head: true }).eq('day', today);
    check('snapshot idempotent (1 dòng/ngày)', dayRows === 1, `rows_today=${dayRows}`);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
