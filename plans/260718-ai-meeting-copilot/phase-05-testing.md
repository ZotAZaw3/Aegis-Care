# Phase 05 — Test + verify

## Overview
- **Priority:** cao. Phụ thuộc: P01–P04.
- **Status:** pending.
- KHÔNG test runner → verify = `tsc` + `build` + kịch bản tay + so số bằng service-key script.

## Test Scenarios
1. **KPI khớp tất định:** service-key script đếm tay (visits done hôm nay, orders overdue, order_violations count, unacked findings) → so với `get_ops_metrics()`. Phải TRÙNG.
2. **Trend không hụt ngày:** `get_ops_trends(current_date-14, current_date)` = 15 phần tử, ngày trống = 0 (không thiếu).
3. **Non-admin bị chặn:** gọi `get_ops_metrics` / POST `/api/meeting-summary` bằng user không phải admin → lỗi/403. Admin → OK.
4. **Báo cáo 0 số bịa + đúng Mức 1:** tạo báo cáo `/api/ops-report` → (a) mọi số trong text có trong `metrics`/`highlights`; (b) phần "vấn đề nổi bật" khớp `highlights`; (c) KHÔNG câu giải thích nguyên nhân ("vì/do…") hay khuyến nghị ("nên/đề xuất…") — grep từ khóa.
5. **Snapshot idempotent:** `SELECT snapshot_ops_metrics()` 2 lần → `ops_metrics_daily` vẫn 1 dòng/ngày.
6. **(nếu cron bật)** `SELECT * FROM cron.job` có job ops-daily-snapshot.

## Implementation Steps
1. `tsc --noEmit` + `npm run build` sạch.
2. `scripts/verify-ops-metrics.mjs` (service key): đếm tay vs RPC (kịch bản 1,2,5).
3. Kịch bản 3,4 chạy tay trên UI (admin + 1 non-admin) + kiểm text summary.
4. Ghi `reports/test-report.md`.

## Todo List
- [ ] tsc + build sạch
- [ ] verify-ops-metrics.mjs: KPI khớp + trend đủ ngày + snapshot idempotent
- [ ] Non-admin chặn (RPC + route)
- [ ] Summary 0 số bịa
- [ ] test-report.md

## Success Criteria
- Kịch bản 1–6 pass; đặc biệt #1 (KPI = query tay) và #4 (báo cáo không bịa số, đúng Mức 1).
- Non-admin không truy cập được số vận hành.

## Risk Assessment
- **Ít dữ liệu → trend phẳng** → chấp nhận; seed 800 BN + tạo vài order/visit demo để chart có hình.
- **Số trong summary khó parse tự động** → kiểm tay chấp nhận được cho scope; ghi rõ.

## Next Steps
- Xong → cập nhật plan.md status + `/ck:journal`. Cân nhắc Supabase realtime cho dashboard (ngoài scope).
