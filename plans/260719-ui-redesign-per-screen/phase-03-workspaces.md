# Phase 03 — Workspaces (/clinic /execution /lab) bố cục Data-Dense

## Context
- `src/routes/_authenticated/{clinic,execution,lab}.tsx`, component: open-cases-board, pending-review-queue, order-execution-list, lab-board. Bằng chứng: /clinic trống ~60% màn.

## Overview
- **Priority:** cao. Phụ thuộc P01. Làm 3 workspace mật độ cao hơn, bố cục có ý, empty state đẹp.

## Lỗi cần sửa (bằng chứng prod)
- `/clinic`: 2 card ngắn + 60% màn trống → thêm **hàng quick-stats** (số ca hôm nay, chờ duyệt, quá hạn) + bố cục lấp đầy hợp lý (không bắt buộc nhồi, nhưng không trống trơ).
- Empty state hiện chỉ 1 dòng chữ giữa card → EmptyState có icon + gợi ý hành động.

## Requirements
**Functional**
- **/clinic**: hàng KPI nhỏ (ca đang mở / chờ duyệt / quá hạn — đếm từ data có sẵn) + 2 khối queue (dùng DataTable hoặc list gọn) + EmptyState đẹp. Filter/search hàng đợi.
- **/execution**: order-execution-list dạng list/table gọn + quick-stats (số y lệnh chờ) + filter + EmptyState.
- **/lab**: lab-board (đã có filter/EmptyState P03 UI) — polish density + quick-stats (số lab chờ).
- Bố cục container max-width hợp lý (không kéo full-width card mỏng), grid Data-Dense.

**Non-functional**
- Reuse component logic; chỉ đổi bố cục/wrap. i18n. Responsive. <200 dòng/route (tách nếu cần).

## Related Code Files
**Modify:** `src/routes/_authenticated/{clinic,execution,lab}.tsx` + component list nếu cần density. **Reuse:** DataTable, quick-stat card (có thể tạo `shared/stat-tile.tsx`).

## Todo List
- [ ] /clinic quick-stats + queue gọn + EmptyState đẹp
- [ ] /execution list/table + stats + filter
- [ ] /lab polish density + stats
- [ ] stat-tile primitive (nếu tách) + i18n + screenshot verify

## Success Criteria (playwright)
- 3 workspace không còn trống trơ; có quick-stats + queue gọn + empty state có icon/gợi ý.

## Risks
- **Quick-stats đếm** — lấy từ query sẵn có (open-cases count, pending-review count), không thêm RPC nặng.

## Next
- P04 dashboard + patient detail.
