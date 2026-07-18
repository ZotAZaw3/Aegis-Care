# Phase 02 — History stock (ops_metrics_daily + snapshot + pg_cron)

## Overview
- **Priority:** trung bình (trend STOCK lịch sử). Phụ thuộc: P01 (dùng lại logic đếm stock).
- **Status:** pending.
- CHỈ cho chỉ số TỒN không dựng lại được (vi phạm treo / finding chưa ack tại ngày quá khứ). Flow đã có ở P01 từ nguồn.

## Key Insights
- pg_cron CHƯA dùng trong repo → cần `CREATE EXTENSION IF NOT EXISTS pg_cron` (Supabase: bật ở Dashboard → Database → Extensions nếu CREATE EXTENSION báo lỗi quyền). **Fallback bắt buộc**: nếu không bật được cron, gọi `snapshot_ops_metrics()` trong route `/api/meeting-summary` (P03) mỗi lần tạo tóm tắt.
- Snapshot = INSERT 1 dòng/ngày (upsert theo `day`), idempotent — chạy nhiều lần/ngày vẫn 1 dòng (cập nhật).

## Requirements
**Functional**
- Bảng `ops_metrics_daily(day date PRIMARY KEY, metrics jsonb NOT NULL, created_at timestamptz DEFAULT now())`. RLS staff/admin read.
- Hàm `snapshot_ops_metrics()` SECURITY DEFINER: tính STOCK hôm nay (open_violations count, unacked_findings count, orders_open count) → `INSERT ... ON CONFLICT (day) DO UPDATE`. REVOKE từ client (chỉ cron/route service gọi) — HOẶC SECURITY DEFINER + guard.
- pg_cron: `cron.schedule('ops-daily-snapshot','5 0 * * *', $$ SELECT public.snapshot_ops_metrics(); $$)` (00:05 hằng ngày).
- `get_ops_trends` (P01) mở rộng đọc thêm `ops_metrics_daily` cho phần stock lịch sử (LEFT JOIN theo ngày) — HOẶC RPC riêng `get_ops_stock_trend(from,to)` đọc bảng này. (Chọn RPC riêng để P01 không phụ thuộc P02.)

**Non-functional**
- Idempotent. Không phá flow (flow vẫn từ nguồn). 1 migration.

## Related Code Files
**Create**
- `supabase/migrations/20260718140100_ops_metrics_daily.sql` — bảng + snapshot fn + pg_cron schedule + RPC get_ops_stock_trend + RLS/grants.

## Implementation Steps
1. Bảng `ops_metrics_daily` + RLS admin-read.
2. `snapshot_ops_metrics()` (upsert stock hôm nay).
3. `CREATE EXTENSION IF NOT EXISTS pg_cron` + `cron.schedule(...)`. Nếu lỗi quyền → ghi chú bật extension ở Dashboard, phần route fallback (P03) vẫn chạy.
4. `get_ops_stock_trend(from,to)` đọc bảng.
5. Áp; chạy tay `SELECT snapshot_ops_metrics()` → kiểm 1 dòng; chạy lại → vẫn 1 dòng (upsert).

## Todo List
- [ ] Bảng ops_metrics_daily + RLS
- [ ] snapshot_ops_metrics() upsert stock
- [ ] pg_cron schedule (+ ghi chú bật extension / fallback)
- [ ] get_ops_stock_trend RPC
- [ ] Áp + test idempotent

## Success Criteria
- `SELECT snapshot_ops_metrics()` → `ops_metrics_daily` có 1 dòng ngày hôm nay; chạy lại không nhân đôi.
- (Nếu cron bật) job xuất hiện trong `cron.job`.
- `get_ops_stock_trend` trả chuỗi ngày có dữ liệu snapshot.

## Risk Assessment
- **pg_cron không bật được** → fallback snapshot-on-summary (P03 gọi). Ghi rõ, KHÔNG chặn tính năng.
- **Trend stock rỗng lúc đầu** (chưa tích lũy ngày) → chấp nhận; flow vẫn có lịch sử từ nguồn. Có thể seed vài ngày bằng cách chạy snapshot thủ công (nhưng chỉ ghi được "hôm nay").

## Security
- `ops_metrics_daily` admin-read (số vận hành). snapshot fn SECURITY DEFINER + REVOKE client.

## Next Steps
- P03 route gọi snapshot fallback. P04 vẽ stock trend từ get_ops_stock_trend.
