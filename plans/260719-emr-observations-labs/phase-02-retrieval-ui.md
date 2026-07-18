# Phase 02 — Lane-1 retrieval (safety_panel + history RPC) + UI hồ sơ

## Context
- `supabase/migrations/20260718060000_customer_graph_rpcs.sql` (get_safety_panel), `src/lib/orders.ts` (SafetyPanel interface + ordersDb), trang chi tiết BN + `SafetyPanel` component (thêm ở f7d4639/6c77918).

## Overview
- **Priority:** cao — giá trị nhìn thấy đầu tiên. Phụ thuộc P01.
- Đưa observations vào Lane-1 (safety) + trang hồ sơ. Mới nhất/mã cho snapshot; history cho trang.

## Key Insights
- `get_safety_panel` là đường Lane-1 mà **cả SafetyPanel UI và Compliance Judge** dùng → thêm `observations` ở đây trúng 2 đích (P02 UI + P03 Judge).
- "Mới nhất/mã" = DISTINCT ON (loinc_code) ORDER BY observed_at DESC.
- Trình bày: value + unit + observed_at + ref_low/high + relevance_vi (từ whitelist JOIN). KHÔNG cờ H/L.

## Requirements
**Functional**
- Mở rộng `get_safety_panel` thêm khóa `observations`: mảng {loinc_code, label_vi, value_num, value_text, unit, observed_at, ref_low, ref_high, related_flag} — mới nhất mỗi mã whitelist active, JOIN whitelist. `CREATE OR REPLACE` (migration mới, KHÔNG sửa file cũ).
- RPC mới `get_observation_history(p_patient_id uuid, p_codes text[] DEFAULT NULL)` → mảng theo thời gian (mọi giá trị, ORDER BY observed_at). NULL codes = tất cả whitelist. SECURITY INVOKER + staff (như get_crm_recall). GRANT authenticated, REVOKE anon.
- UI: mở rộng `SafetyPanel` (hoặc block mới `LabResultsPanel`) trên trang chi tiết BN — hiện observations mới nhất, nhóm bleeding/tiểu đường/tim mạch. Cập nhật interface `SafetyPanel` trong orders.ts thêm `observations`.

**Non-functional**
- Component <200 dòng. i18n vi+en nhãn lab. Không thêm lib.

## Related Code Files
**Create:** `supabase/migrations/20260719100100_safety_panel_observations.sql` (CREATE OR REPLACE get_safety_panel + get_observation_history)
**Modify:** `src/lib/orders.ts` (SafetyPanel interface +observations, type ObservationFact), `src/lib/i18n.tsx`, component SafetyPanel/LabResultsPanel + trang chi tiết BN.

## Implementation Steps
1. Migration: CREATE OR REPLACE get_safety_panel (thêm CTE observations DISTINCT ON) + get_observation_history + grants.
2. orders.ts: type `ObservationFact`, thêm vào SafetyPanel interface.
3. UI: render observations (value + đơn vị + ngày + "tham chiếu low–high"); trạng thái rỗng.
4. i18n keys lab_*; `tsc` + build.

## Todo List
- [ ] CREATE OR REPLACE get_safety_panel +observations (latest/mã)
- [ ] get_observation_history RPC
- [ ] orders.ts types + UI panel
- [ ] i18n + build sạch

## Success Criteria
- Trang BN demo hiện INR/HbA1c/… value + ngày + ref range, khớp emr_observations.
- Non-staff không đọc được (RLS).
- KHÔNG cờ "bất thường"/màu đỏ — chỉ số + tham chiếu.

## Risks
- **DISTINCT ON perf** → index (patient_id, loinc_code, observed_at desc) đã tạo P01.
- **get_safety_panel đang được SafetyPanel/copilot dùng** → thêm khóa mới KHÔNG phá caller cũ (chỉ thêm field).

## Security
- SECURITY INVOKER + RLS staff-read; như các Lane RPC hiện có.

## Next
- P03 dùng `observations` trong get_safety_panel cho Judge. P04 dùng get_observation_history.
