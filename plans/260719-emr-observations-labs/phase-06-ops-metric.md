# Phase 06 — Ops report metric (BN chống đông thiếu/hết hạn INR)

## Context
- `supabase/migrations/20260718140000_ops_metrics_rpc.sql` (get_ops_metrics + highlights), `src/components/manager/*` (Ops dashboard), plan `260718-ai-meeting-copilot` (builds_on).

## Overview
- **Priority:** thấp — lớp quản trị, không lâm sàng. Phụ thuộc P01 (emr_observations) + Ops Report (đã có).
- Chỉ số tổng hợp tất định: BN chống đông chưa có INR gần đây (an toàn quản trị).

## Key Insights
- Bám ranh giới Ops: đếm + highlight tất định, KHÔNG %, KHÔNG khuyến nghị. LLM chỉ thuật.
- "BN chống đông thiếu INR" = BN có emr_medications ∩ anticoagulant keyword (active) NHƯNG không có emr_observations loinc='6301-6' trong N ngày (vd 90).

## Requirements
**Functional**
- CREATE OR REPLACE `get_ops_metrics` (migration mới) thêm vào `highlights`: `anticoag_missing_inr` = số BN chống đông active không có INR ≤90 ngày (+ 1–2 ví dụ tên nếu cần). HOẶC RPC riêng `get_lab_gaps()` nếu muốn tách khỏi ops core (KISS: nhét vào highlights).
- Ops prompt (OPS_REPORT_PROMPT) KHÔNG cần đổi (chỉ thuật highlights) — nhưng thêm 1 dòng mô tả field mới nếu prompt liệt kê field.
- UI: 1 dòng trong OpsReportPanel/KPI (tùy chọn) hiển thị con số.

**Non-functional**
- Chỉ SELECT/aggregate. 1 migration CREATE OR REPLACE (KHÔNG sửa file cũ).

## Related Code Files
**Create:** `supabase/migrations/20260719100300_ops_lab_gaps.sql` (CREATE OR REPLACE get_ops_metrics +highlight, hoặc get_lab_gaps).
**Modify (tùy chọn):** `src/components/manager/ops-kpi-cards.tsx` + i18n nếu hiện lên UI.

## Implementation Steps
1. Migration: thêm highlight anticoag_missing_inr (subquery emr_medications ∩ keywords \ emr_observations INR ≤90d).
2. (tùy chọn) UI + i18n hiển thị.
3. `tsc` + build; verify số bằng query tay.

## Todo List
- [ ] highlight anticoag_missing_inr trong get_ops_metrics
- [ ] (tùy chọn) UI + i18n
- [ ] build + verify số tay

## Success Criteria
- get_ops_metrics().highlights có anticoag_missing_inr khớp query tay.
- Báo cáo Ops thuật con số này, KHÔNG khuyến nghị.

## Risks
- **Định nghĩa "chống đông"** dùng lại nka_systemic_flags keyword (DRY) — tránh lệch định nghĩa.
- **90 ngày tùy ý** → hằng số ghi rõ trong comment; không thành %/score.

## Security
- Admin-gated như get_ops_metrics hiện tại (guard has_role admin).

## Next
- Kết thúc plan. Cân nhắc mở rộng whitelist thêm lab khi có nhu cầu (YAGNI tới đó).
