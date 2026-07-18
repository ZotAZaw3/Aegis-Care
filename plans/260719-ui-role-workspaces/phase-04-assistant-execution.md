# Phase 04 — Assistant workspace `/execution`

## Context
- Component sẵn: `src/components/assistant/{order-execution-list,order-execute-card}.tsx` (HIỆN KHÔNG CÓ ROUTE). `medical_orders` (assigned_role='assistant' cần thực thi), order_evidence (bằng chứng đóng order).

## Overview
- **Priority:** trung bình. Phụ thuộc P01.
- `/execution` = home trợ thủ: danh sách y lệnh assigned cho trợ thủ cần thực thi (nộp bằng chứng → đóng). Component đã có, chỉ thiếu route + home.

## Key Insights
- `order-execution-list` đã dựng sẵn logic thực thi — chỉ cần gắn vào route `/execution` + PageHeader + filter + EmptyState.
- Trợ thủ cũng hỗ trợ tiếp đón → nav có thêm /reception (đã set ở P01).

## Requirements
**Functional**
- Trang `/execution`: `PageHeader` "Thực thi y lệnh" + `order-execution-list` (y lệnh assigned_role in trợ thủ, trạng thái mở). Filter theo trạng thái/loại/tên BN. EmptyState. Gate assistant/admin.
- Giữ luồng nộp bằng chứng/đóng order của order-execute-card.

**Non-functional**
- Tách filter nếu cần. i18n vi+en. <200 dòng/file.

## Related Code Files
**Create:** `src/routes/_authenticated/execution.tsx`.
**Reuse:** order-execution-list, order-execute-card. **Modify:** i18n.

## Implementation Steps
1. `/execution` render PageHeader + order-execution-list + filter + gate.
2. EmptyState + i18n. `tsc` + build. Test: assistant login → /execution → thực thi + đóng 1 order.

## Todo List
- [ ] /execution route + gate assistant
- [ ] Filter + EmptyState
- [ ] i18n + build; test đóng order

## Success Criteria
- Assistant login → `/execution` thấy y lệnh cần thực thi; nộp bằng chứng → đóng order (trigger auto-close backend chạy).
- Non-assistant không thấy /execution.

## Risks
- **order-execution-list query** có thể cần điều chỉnh filter theo assigned_role — kiểm khi gắn.

## Security
- Gate assistant + RLS backend (orders staff).

## Next
- P05 reception/admin.
