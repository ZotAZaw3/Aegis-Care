---
title: AI Ops Report & Analytics (management layer)
status: code-complete (migrations chờ áp tay + test trên prod)
created: 2026-07-18
builds_on: [260718-0111-order-centric-clinic-system, 260718-compliance-judge-rag]
blockedBy: []
blocks: []
---

# AI Ops Report & Analytics — Overview

Lấp gap #7 Executive Summary. **KHÔNG số hóa buổi giao ban** (giao ban 7h offline giữ nguyên) — AI tạo **báo cáo tóm tắt vận hành + vấn đề nổi bật + phân tích** để lãnh đạo đọc bất kỳ lúc nào và tự ra quyết định. Thiết kế chốt ở `brainstorm-report.md` (authoritative).

**Nguyên tắc:** 80% dashboard TẤT ĐỊNH + 20% AI. **LLM CHỈ diễn giải số đã tính, KHÔNG tính số.** Deterministic-first · KHÔNG compliance_score (đếm + Δ thay %) · **phân tích Mức 1 (bám số): xếp hạng/so sánh/xu hướng + khoan vào thực thể sau con số; CẤM giải thích nguyên nhân, CẤM khuyến nghị quyết định** (lãnh đạo quyết — human-first). Tái dùng stack copilot + recharts (đã có deps).

## Kiến trúc 3 tầng
- **T1 Metrics tất định** — RPC `get_ops_metrics(from,to)` (snapshot + Δ + **highlights**: thực thể nổi bật như order quá hạn cũ nhất, vai nhiều vi phạm nhất, finding chưa ack lâu nhất) + `get_ops_trends(from,to)` (chuỗi ngày FLOW từ nguồn). SECURITY INVOKER, gate `has_role('admin')`.
- **T2 Lịch sử STOCK** — `ops_metrics_daily` + `snapshot_ops_metrics()` + pg_cron daily (fallback: snapshot trong route report). Chỉ cho stock (vi phạm treo / finding chưa ack) — flow KHÔNG snapshot.
- **T3 Báo cáo vận hành** — `/api/ops-report` (JWT→RLS, server tự gọi metrics, gpt-4o-mini temp 0, **phân tích Mức 1**) → lưu `ops_reports`.

UI: `/dashboard` (admin) — KPI cards + Δ, chart recharts, khối lượng theo `assigned_role`, nút "Tạo báo cáo vận hành" + lịch sử báo cáo.

## Phases
| # | Phase | Trạng thái | File |
|---|---|---|---|
| 01 | Metrics RPC (get_ops_metrics + get_ops_trends) | code ✓ (migration chờ áp) | [phase-01](phase-01-metrics-rpc.md) |
| 02 | History stock (ops_metrics_daily + snapshot fn + pg_cron) | code ✓ (migration chờ áp) | [phase-02](phase-02-history-cron.md) |
| 03 | Route /api/ops-report + prompt (Mức 1) + ops_reports | code ✓ (migration chờ áp) | [phase-03](phase-03-meeting-summary.md) |
| 04 | Dashboard UI (KPI + recharts + workload + report panel) | code ✓ (tsc/build sạch) | [phase-04](phase-04-dashboard-ui.md) |
| 05 | Test + verify | chờ (áp migration → chạy verify-ops-metrics.mjs + test UI) | [phase-05](phase-05-testing.md) |

## Trạng thái triển khai (2026-07-18)
- **Code hoàn tất, tsc --noEmit + npm run build sạch.** routeTree.gen.ts đã regen (có /api/ops-report).
- **Chờ áp tay 3 migration** qua Supabase SQL Editor (theo thứ tự): `20260718140000_ops_metrics_rpc.sql` → `20260718140100_ops_metrics_daily.sql` → `20260718140200_ops_reports.sql`.
- Guard RPC: `auth.uid() IS NOT NULL AND NOT has_role(admin)` → chặn non-admin authenticated, cho service_role/cron (uid NULL) qua. anon bị REVOKE EXECUTE.
- Sau khi áp: chạy `node scripts/verify-ops-metrics.mjs` (KPI khớp + trend 15 ngày + snapshot idempotent) + test UI admin/non-admin + kiểm báo cáo không bịa số / đúng Mức 1.
- pg_cron: DO-block tự bật + schedule, có EXCEPTION fallback (route snapshot-on-report luôn chạy nếu cron không bật).

## Dependencies (đã áp, không block)
- Views `order_violations`/`pending_review_orders`, `medical_orders`, `visit_sessions`, `compliance_judgments`, `has_role(uid, app_role)` (GRANT authenticated), `staff`/`user_roles`.
- recharts@2.15.4 (deps). Copilot stack `src/server/copilot/`.

## Ràng buộc
File <200 dòng · i18n vi+en · migration áp tay SQL Editor (immutable) · types.ts cũ → `ordersDb`/`db as any` · RLS gate admin · KHÔNG department (nhóm theo `assigned_role`) · KHÔNG thêm lib.

## Ranh giới (nói khi demo)
- Đếm + Δ (↑/↓), KHÔNG %. "Tỷ lệ tuân thủ" → diễn đạt lại = số vi phạm treo / finding chưa xử lý.
- KHÔNG số hóa giao ban (offline giữ nguyên). AI = báo cáo/phân tích on-demand.
- Phân tích **Mức 1** (bám số): so sánh/xu hướng/khoan thực thể. KHÔNG nguyên nhân, KHÔNG khuyến nghị.
