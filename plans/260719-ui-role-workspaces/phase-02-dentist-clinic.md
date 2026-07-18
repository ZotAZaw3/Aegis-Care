# Phase 02 — Dentist workspace `/clinic`

## Context
- Component sẵn: `src/components/manager/open-cases-board.tsx`, `src/components/dentist/{pending-review-queue,active-orders-list,briefing-panel,safety-panel,order-draft-panel,compliance-judge-dialog}.tsx`. Route đích khám: `src/routes/_authenticated/visits.$id.tsx` (giữ nguyên).

## Overview
- **Priority:** cao — trung tâm sản phẩm + demo VAIC. Phụ thuộc P01 (stub + primitive).
- `/clinic` = home bác sĩ: hàng đợi khám của tôi + chờ duyệt → click vào `/visits/$id` (ký y lệnh + Judge + safety + labs đã có).

## Key Insights
- KHÔNG xây lại khám — `/visits/$id` đã đủ (ký + Compliance Judge + safety_panel + observations P02 obs). `/clinic` chỉ là **entry point + hàng đợi** thay cho việc lục từ /dashboard.
- Dùng `open-cases-board` (ca đang mở) + `pending-review-queue` (chờ tôi duyệt). Bọc bằng `PageHeader` + `SectionCard`.
- **no-filtering anti-pattern** → thêm filter/search (theo tên BN / số thứ tự / trạng thái) trên hàng đợi.

## Requirements
**Functional**
- Trang `/clinic` (thay stub): `PageHeader` "Phòng khám" + 2 khối: **Hàng đợi khám** (open-cases-board, filter theo tên/số/trạng thái) + **Chờ tôi duyệt** (pending-review-queue). EmptyState khi rỗng. Click ca → `/visits/$id`.
- Gate: chỉ dentist/admin render (non-dentist vào → redirect resolveHome hoặc thông báo).
- Tùy chọn: tab "Chờ duyệt" tách route `/clinic/review` nếu dài (KISS: 1 trang 2 section trước).

**Non-functional**
- Tách component nếu >200 dòng: `clinic-queue.tsx` (filter+list) riêng. i18n vi+en.

## Related Code Files
**Create:** `src/routes/_authenticated/clinic.tsx` (thay stub), `src/components/dentist/clinic-queue.tsx` (nếu cần tách filter).
**Reuse:** open-cases-board, pending-review-queue. **Modify:** i18n.

## Implementation Steps
1. `/clinic` render PageHeader + 2 SectionCard (queue + review) + gate dentist.
2. Filter/search hàng đợi + EmptyState.
3. i18n. `tsc` + build. Test: dentist login → /clinic → click ca → /visits/$id ký được.

## Todo List
- [ ] /clinic: queue + review + gate dentist
- [ ] Filter/search + EmptyState hàng đợi
- [ ] i18n + build; test luồng vào khám

## Success Criteria
- Dentist login → `/clinic` thấy ca đang mở + chờ duyệt; lọc được; vào `/visits/$id` ký y lệnh + Judge chạy.
- Non-dentist không thấy /clinic.

## Risks
- **Trùng open-cases-board với /dashboard** → sau P05 gỡ open-cases khỏi dashboard non-admin (dashboard thành admin-only Ops). Tránh 2 nơi.

## Security
- Gate UI dentist + RLS backend (orders/visits staff).

## Next
- P05 dọn /dashboard (bỏ open-cases khỏi non-admin). P03 lab.
