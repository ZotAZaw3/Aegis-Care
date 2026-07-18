# Phase 04 — Dashboard UI (KPI + recharts + workload + summary panel)

## Overview
- **Priority:** cao (mặt tiền demo). Phụ thuộc: P01 (metrics), P03 (summary).
- **Status:** pending.
- Mở rộng `/dashboard` (hiện chỉ `OpenCasesBoard` + `CopilotHome`). Admin-gated.

## Key Insights
- `recharts@2.15.4` ĐÃ trong deps → dùng `LineChart`/`BarChart`, KHÔNG thêm lib.
- Đọc RPC qua `ordersDb.rpc("get_ops_metrics"/"get_ops_trends")` (types.ts cũ → cast sẵn). TanStack Query `refetchInterval` ~30s cho "realtime-ish" (KISS; Supabase realtime để sau).
- Gate admin: kiểm `roles.includes('admin')` từ `useAuth()`; non-admin không render trang ops (hoặc chỉ thấy OpenCasesBoard cũ).
- Δ hiển thị mũi tên ↑/↓ + màu; KHÔNG %.

## Requirements
**Functional** — component tách nhỏ (<200 dòng/file):
- `OpsKpiCards` — hàng thẻ: BN hôm nay, order quá hạn, vi phạm treo, finding chưa ack; mỗi thẻ có Δ hôm nay/hôm qua.
- `OpsTrendChart` — recharts LineChart từ `get_ops_trends` (visits/orders_created/orders_closed/judge_findings theo ngày). Chọn khoảng 14/30 ngày.
- `OpsWorkloadByRole` — BarChart order mở theo `assigned_role` (lễ tân/trợ thủ/bác sĩ) + pending_review theo bác sĩ.
- `OpsReportPanel` — nút "Tạo báo cáo vận hành" → POST `/api/ops-report` (token như use-copilot-chat.ts) → hiện báo cáo (tóm tắt + vấn đề nổi bật + phân tích); danh sách báo cáo đã lưu (query `ops_reports` desc).
- Trang `/dashboard`: nếu admin → render 4 khối trên + OpenCasesBoard; nếu không → giữ nguyên hiện tại.

**Non-functional**
- Mỗi component 1 file <200 dòng. i18n vi+en mọi label. `t()` không interpolate → `.replace()`.

## Related Code Files
**Create**
- `src/components/manager/ops-kpi-cards.tsx`
- `src/components/manager/ops-trend-chart.tsx`
- `src/components/manager/ops-workload-by-role.tsx`
- `src/components/manager/ops-report-panel.tsx`
- (tùy chọn) `src/components/manager/use-ops-metrics.ts` — hook query get_ops_metrics/trends.

**Modify**
- `src/routes/_authenticated/dashboard.tsx` — render các khối khi admin.
- `src/lib/i18n.tsx` — keys ops_* (vi+en).

## Implementation Steps
1. Hook `use-ops-metrics` (query 2 RPC, refetchInterval).
2. 4 component (cards / trend / workload / summary panel).
3. Ghép vào dashboard.tsx (admin gate).
4. i18n. `tsc` + build.

## Todo List
- [ ] use-ops-metrics hook
- [ ] OpsKpiCards + Δ
- [ ] OpsTrendChart (recharts)
- [ ] OpsWorkloadByRole
- [ ] OpsReportPanel (tạo báo cáo + lịch sử)
- [ ] dashboard.tsx admin gate + i18n

## Success Criteria
- Admin mở `/dashboard` → 4 khối hiện số khớp RPC; chart có dữ liệu ≥2 tuần.
- Non-admin → không thấy khối ops.
- Bấm "Tạo báo cáo vận hành" → báo cáo hiện + lưu, xuất hiện trong danh sách.

## Risk Assessment
- **recharts SSR** (TanStack Start) → render client-side (component 'use client'-style; TanStack Start hydrate). Nếu lỗi SSR → wrap dynamic/guard `typeof window`.
- **File phình >200 dòng** → tách đúng 4 component + hook.

## Security
- Admin gate ở UI + RPC tự guard (không dựa mỗi UI).

## Next Steps
- P05 verify KPI khớp + non-admin chặn + summary không bịa số.
