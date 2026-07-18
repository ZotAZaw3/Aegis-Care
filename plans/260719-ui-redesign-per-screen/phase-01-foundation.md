# Phase 01 — Foundation: sidebar + breadcrumb + header + density + DataTable

## Context
- `src/components/app-sidebar.tsx` (icon-only, defaultOpen=false), `src/components/breadcrumbs.tsx` (hiện raw "clinic"), `src/routes/_authenticated/route.tsx` (SidebarProvider defaultOpen=false), `src/components/ui/{sidebar,table}.tsx`, `design-system/aegis-care/MASTER.md`.

## Overview
- **Priority:** cao — nền cho mọi màn. Sửa 2 lỗi rõ (sidebar icon-only, breadcrumb raw) + primitive dùng lại.

## Lỗi cần sửa (bằng chứng prod)
- Sidebar icon-only → thêm NHÃN (label luôn hiện, không chỉ hover-expand). defaultOpen=true hoặc rail rộng có label.
- Breadcrumb "clinic" raw → map route segment → nhãn i18n (clinic→Phòng khám, lab→Xét nghiệm, execution→Thực thi...).

## Requirements
**Functional**
- **Sidebar**: hiện icon + nhãn cố định (bỏ collapse mặc định, hoặc expanded rail 220px). Nhóm mục (Vận hành / Hồ sơ / Quản trị). Active state rõ (bg + màu). Giữ logic role hiện có.
- **Breadcrumb**: `route→label` dùng i18n (map segment: dashboard, clinic, execution, lab, reception, patients, follow-ups, crm, admin, visits). Ẩn id segment (uuid) → thay bằng tên nếu có.
- **Header**: giữ; canh spacing, role badge rõ.
- **Density tokens**: chuẩn hóa spacing (Data-Dense: padding card 16px thay 24px; gap 12-16px). Có thể thêm util class.
- **DataTable primitive** `src/components/shared/data-table.tsx`: bảng shadcn (table.tsx) + header sort + empty + loading skeleton, dùng cho P02 (patients) + các list.

**Non-functional**
- File <200 dòng. i18n vi+en nhãn breadcrumb. Verify: screenshot sidebar có nhãn + breadcrumb dịch.

## Related Code Files
**Create:** `src/components/shared/data-table.tsx`.
**Modify:** `src/components/app-sidebar.tsx`, `src/components/breadcrumbs.tsx`, `src/routes/_authenticated/route.tsx` (sidebar default), `src/lib/i18n.tsx`.

## Todo List
- [ ] Sidebar icon+nhãn + nhóm + active rõ
- [ ] Breadcrumb map route→label i18n (ẩn uuid)
- [ ] Density tokens (padding/gap Data-Dense)
- [ ] DataTable primitive (sort/empty/skeleton)
- [ ] i18n + screenshot verify

## Success Criteria (verify bằng playwright screenshot)
- Sidebar hiện nhãn từng mục (không icon-only).
- Breadcrumb hiện "Phòng khám" thay "clinic".
- DataTable render được (dùng ở P02).

## Risks
- **Sidebar expanded chiếm ngang** → responsive: thu gọn <1024 (drawer). Không phá mobile.

## Next
- P02 dùng DataTable cho patients.
