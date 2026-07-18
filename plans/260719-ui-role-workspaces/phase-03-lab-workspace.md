# Phase 03 — Lab workspace `/lab` + P05 form nhập kết quả

## Context
- `src/routes/my-checklist.$id.tsx` (màn đọc QR hiện có), `lab_orders` (test_name, status ordered/in_progress/completed, result_note, +cột P05: loinc_code/value_num/value_text/unit), trigger `emit_observation_on_lab_done` (ĐÃ SHIP — completed+loinc → emr_observations clinic), `emr_observation_whitelist` (mã LOINC + label_vi + unit). Thư mục `src/components/lab/` **trống**.

## Overview
- **Priority:** cao — **hoàn thành P05-UI** còn treo của `260719-emr-observations-labs` (backend trigger đã ship). Phụ thuộc P01.
- `/lab` = home lab tech: danh sách lab_orders cần làm + **form nhập kết quả có cấu trúc** (chọn mã LOINC + giá trị) → set completed → trigger tự emit observation vào graph.

## Key Insights
- Backend đã sẵn: chỉ cần UI update `lab_orders` set `status='completed'` + `loinc_code`+`value_num/value_text`+`unit` → trigger lo phần còn lại. Đây là mảnh UI DUY NHẤT thiếu của đường lab sống.
- Whitelist cho dropdown mã: query `emr_observation_whitelist` (label_vi + unit auto). Nhập số → value_num; text (hút thuốc) → value_text.
- Lab tech dùng **tablet** → touch target ≥44px, spacing thoáng, form đơn giản.
- Lab tự do (không chọn mã) vẫn được: chỉ ghi result_note, không tạo observation (trigger bỏ qua khi loinc_code NULL).

## Requirements
**Functional**
- Trang `/lab`: `PageHeader` "Lab" + danh sách lab_orders `status IN (ordered,in_progress)` (query trực tiếp qua RLS staff, join visit→patient tên). Filter theo trạng thái/tên. EmptyState.
- **Dialog/inline "Hoàn tất lab"**: chọn mã LOINC (dropdown label_vi từ whitelist, unit auto) HOẶC bỏ trống (lab tự do); input giá trị (số/text theo mã); nút "Hoàn tất" → update lab_orders {status:'completed', completed_at, completed_by, loinc_code, value_num/value_text, unit, result_note}. Submit feedback + success.
- Sau hoàn tất: invalidate list; (nếu có mã) observation xuất hiện ở safety_panel BN (trigger).
- Gate: lab_technician/admin.
- `my-checklist.$id` QR giữ nguyên (màn BN/điều dưỡng xem tiến độ).

**Non-functional**
- Component tách: `lab-board.tsx` (list+filter), `lab-complete-dialog.tsx` (form). <200 dòng/file. i18n vi+en. Tablet responsive (≥44px touch).

## Related Code Files
**Create:** `src/routes/_authenticated/lab.tsx`, `src/components/lab/{lab-board,lab-complete-dialog}.tsx`, hook query whitelist.
**Reuse:** ordersDb, whitelist RPC/table. **Modify:** i18n.

## Implementation Steps
1. `/lab` lab-board: list lab_orders ordered/in_progress + filter + EmptyState + gate.
2. lab-complete-dialog: dropdown whitelist + input value + submit update lab_orders completed.
3. i18n + tablet responsive. `tsc` + build.
4. Test end-to-end: hoàn tất 1 lab với mã INR → emr_observations(clinic) → hiện ở safety_panel BN + Judge.

## Todo List
- [ ] /lab lab-board (list+filter+gate+EmptyState)
- [ ] lab-complete-dialog (whitelist dropdown + value + submit)
- [ ] i18n + tablet touch ≥44px
- [ ] Test clinic → graph → panel/judge

## Success Criteria
- Lab tech login → `/lab` thấy lab cần làm; hoàn tất với mã LOINC → observation clinic vào graph, hiện ở hồ sơ BN.
- Lab tự do (không mã) → chỉ result_note, không tạo observation.
- Non-lab không thấy /lab.

## Risks
- **Nhập sai đơn vị/mã** → dropdown mã cố định + unit auto từ whitelist.
- **value số vs text** → theo category/kiểu mã (số cho lab, text cho hút thuốc); validate inline.

## Security
- Update lab_orders qua RLS staff; trigger SECURITY DEFINER lo ghi emr_observations. Không service role.

## Next
- Đóng P05-UI của plan observations. P04 assistant.
