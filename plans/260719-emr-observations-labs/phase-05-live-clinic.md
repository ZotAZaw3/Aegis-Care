# Phase 05 — Nhập lâm sàng sống (lab_orders cấu trúc + trigger + UI lab tech)

## Context
- `20260717100100_replace_appointments_with_visit_queue.sql` (lab_orders: test_name, result_note, status ordered|in_progress|completed, completed_at/by), `20260718110000_live_graph_source_and_triggers.sql` (pattern trigger source='clinic'), `src/components/assistant/order-execution-list.tsx` / lab-tech board.

## Overview
- **Priority:** trung bình — hoàn thiện vận hành (kết quả lab thật vào graph). Phụ thuộc P01 (bảng emr_observations).
- Phase lớn nhất (có UI thật). Làm SAU khi seed đã chứng minh giá trị (P02/P03).

## Key Insights
- `lab_orders` đã là đường lab vận hành. `result_note` là text tự do → cần trường CẤU TRÚC để thành observation (loinc/value/unit).
- Mirror pattern live-graph: trigger SECURITY DEFINER khi lab_order `completed` → INSERT emr_observations(source='clinic').
- KISS: chỉ cấu trúc hóa khi lab tech CHỌN 1 mã whitelist (dropdown) + nhập số; nếu để test_name tự do thì vẫn lưu result_note như cũ (không ép mọi lab).

## Requirements
**Functional**
- ALTER `lab_orders` thêm: `loinc_code text` (FK-ish whitelist, null), `value_num numeric null`, `value_text text null`, `unit text null`.
- Trigger `emit_observation_on_lab_done()` SECURITY DEFINER + search_path + REVOKE client: AFTER UPDATE OF status khi NEW.status='completed' AND OLD.status<>'completed' AND NEW.loinc_code IS NOT NULL → INSERT emr_observations(patient_id từ visit_sessions, encounter_id NULL, loinc_code, value_num/value_text, unit, observed_at=COALESCE(completed_at,now()), source='clinic').
- UI lab-tech board: khi hoàn tất lab, cho chọn mã whitelist (dropdown label_vi) + nhập giá trị + đơn vị auto từ whitelist. Nếu không chọn mã → giữ result_note tự do (không tạo observation).
- patient_id: lab_orders chỉ có visit_session_id → trigger JOIN visit_sessions lấy patient_id.

**Non-functional**
- Trigger idempotent-ish (chỉ bắn 1 lần lúc chuyển completed). File UI <200 dòng.

## Related Code Files
**Create:** `supabase/migrations/20260719100200_lab_orders_observations.sql` (ALTER + trigger + grants).
**Modify:** component lab-tech board (dropdown mã + value), i18n.

## Implementation Steps
1. Migration ALTER lab_orders + trigger DEFINER.
2. UI: dropdown whitelist + input value khi completed.
3. i18n; `tsc` + build.
4. Test: hoàn tất 1 lab với mã INR → emr_observations có dòng source='clinic' → hiện ở SafetyPanel (P02) + Judge (P03).

## Todo List
- [ ] ALTER lab_orders + trigger emit observation
- [ ] UI lab tech chọn mã + nhập value
- [ ] i18n + build
- [ ] Test end-to-end clinic → graph → panel/judge

## Success Criteria
- Lab completed với mã whitelist → 1 dòng emr_observations(source='clinic'); hiện ngay ở panel/judge/copilot.
- Lab không chọn mã → không tạo observation (không ép).

## Risks
- **Lab tech nhập sai đơn vị/mã** → dropdown mã cố định + đơn vị auto từ whitelist giảm sai.
- **Trigger bắn trùng** → điều kiện OLD<>completed; như pattern live-graph.
- **Scope UI** → có thể tách plan riêng nếu thời gian gấp (đánh dấu ranh giới).

## Security
- Trigger SECURITY DEFINER + search_path + REVOKE client (chuẩn hệ thống). RLS emr_observations staff-read.

## Next
- P06 ops metric có thể dùng cả observation source='clinic'.
