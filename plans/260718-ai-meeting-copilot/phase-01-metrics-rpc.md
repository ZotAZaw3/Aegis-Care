# Phase 01 — Metrics RPC (tất định)

## Overview
- **Priority:** cao (nền sự thật cho cả dashboard + summary). Độc lập.
- **Status:** pending.
- 2 RPC read-only, deterministic. Migration mới (áp tay SQL Editor).

## Key Insights
- Nguồn có sẵn timestamp → tính cả snapshot lẫn trend từ nguồn, KHÔNG bảng mới ở phase này:
  - `visit_sessions(status, created_at, closed_at)` — status enum gồm 'pending'…'done'.
  - `medical_orders(status, order_type, assigned_role, due_at, opened_at, closed_at, created_at)`. order_status: open/routed/in_progress/awaiting_review/closed/cancelled.
  - `order_violations` view (id, order_type, assigned_role, violation_kind).
  - `pending_review_orders` view (+ assigned_dentist_id).
  - `compliance_judgments(verdict, findings, acked_by, created_at)` — chưa ack = `acked_by IS NULL` + có hard_findings trong findings.
- `has_role(auth.uid(),'admin')` GRANT authenticated → dùng guard trong RPC (RAISE nếu không admin) HOẶC để RLS lo; đơn giản: RPC SECURITY INVOKER + guard `IF NOT has_role(auth.uid(),'admin') THEN RAISE insufficient_privilege`.
- **FLOW** (trend) = COUNT theo `date_trunc('day', ...)` trên nguồn. **STOCK** (snapshot hiện tại) = count trạng thái as-of-now. Δ hôm nay/hôm qua = 2 flow count.

## Requirements
**Functional**
- `get_ops_metrics(p_from date DEFAULT current_date, p_to date DEFAULT current_date)` → jsonb:
  - `patients`: visits hôm nay theo status (đang chờ / đang khám / done); tổng BN active.
  - `orders`: đếm theo status + theo order_type; `overdue` = open/routed/in_progress/awaiting_review AND due_at<now.
  - `violations`: tổng + theo violation_kind + theo assigned_role (từ order_violations).
  - `judge`: số lượt hôm nay, số verdict has_findings, số **chưa ack** (acked_by IS NULL AND findings->'hard_findings' <> '[]').
  - `workload`: order mở theo assigned_role; pending_review theo assigned_dentist_id (join staff.full_name).
  - `delta`: {visits, orders_closed, violations_new} hôm nay vs hôm qua (flow).
  - `highlights`: thực thể nổi bật TẤT ĐỊNH cho phần "vấn đề nổi bật" của báo cáo (P03) — LLM không tự chọn: order quá hạn cũ nhất (title + số ngày), vai (`assigned_role`) nhiều vi phạm nhất (+count), finding chưa ack lâu nhất (số ngày), bác sĩ tồn pending_review nhiều nhất (+count). Mỗi mục kèm số để LLM chỉ thuật lại.
- `get_ops_trends(p_from date, p_to date)` → jsonb mảng theo ngày: `{day, visits, orders_created, orders_closed, judge_findings}` (FLOW, GROUP BY ngày).
- Cả 2: SECURITY INVOKER, guard admin, GRANT EXECUTE authenticated, REVOKE anon.

**Non-functional**
- Chỉ SELECT/aggregate, không ghi. Index sẵn (idx_orders_role_status, idx orders due) đủ. File 1 migration.

## Related Code Files
**Create**
- `supabase/migrations/20260718140000_ops_metrics_rpc.sql` — 2 RPC + grants.

## Implementation Steps
1. Viết `get_ops_metrics` (jsonb_build_object gộp các sub-aggregate; dùng CTE/subquery cho gọn).
2. Viết `get_ops_trends` (generate_series ngày LEFT JOIN count nguồn để không hụt ngày trống).
3. Guard admin + grants.
4. Áp migration; test tay bằng service key so số.

## Todo List
- [ ] get_ops_metrics (patients/orders/violations/judge/workload/delta)
- [ ] get_ops_trends (flow theo ngày, generate_series)
- [ ] guard has_role admin + grants
- [ ] Áp + so số query tay

## Success Criteria
- `SELECT get_ops_metrics()` trả jsonb khớp count tay trên từng bảng.
- `get_ops_trends(current_date-14, current_date)` trả 15 phần tử (không hụt ngày trống).
- Gọi bằng user non-admin → lỗi insufficient_privilege (hoặc rỗng nếu chọn RLS-only).

## Risk Assessment
- **Query nặng khi nhiều order** → aggregate có index; snapshot chỉ đếm, không kéo hàng.
- **Ngày trống trong trend** → generate_series + LEFT JOIN COALESCE 0.
- **Δ khi chưa có dữ liệu hôm qua** → COALESCE 0, không chia (không có %).

## Security
- SECURITY INVOKER + guard admin; số vận hành chỉ admin thấy.

## Next Steps
- P03 gọi lại `get_ops_metrics`; P04 vẽ từ cả 2 RPC. P02 snapshot stock để trend stock lịch sử.
