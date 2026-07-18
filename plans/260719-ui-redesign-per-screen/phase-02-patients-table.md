# Phase 02 — Patients → Data-Dense table

## Context
- `src/routes/_authenticated/patients.index.tsx` (card grid thưa cho 802 BN), DataTable primitive (P01), `patients` table (đã phân trang backend — plan trước a9d6ac1). `src/components/manager/dashboard-search-bar.tsx`.
- **Design nguồn: `design-system/aegis-care/pages/patients.md`** (override MASTER) — bám file này trước.
- UX guidelines (ui-ux-pro-max): table horizontal-scroll trong container; reserve space (chống content-jump/CLS); deep-link URL cho filter/sort/trang; (tùy chọn) multi-select + bulk.

## Overview
- **Priority:** cao — lỗi rõ nhất (card grid thưa → table Data-Dense). Phụ thuộc P01.

## Lỗi cần sửa (bằng chứng prod)
- 802 BN hiển thị **card grid TO/thưa** (5 cột card lớn, nhiều "—", avatar placeholder đơn điệu) → **table gọn**: mật độ cao, nhiều hàng/màn, quét nhanh.

## Requirements
**Functional**
- Thay card grid bằng **DataTable**: cột Tên · Ngày sinh · SĐT · Giới · Lần khám gần nhất (nếu rẻ) · (action). Hàng click → `/patients/$id`.
- **Filter/sort**: search theo tên/SĐT (đã có) + sort theo tên/ngày sinh (header click). **Phân trang** (dùng backend pagination sẵn có, 24-50/trang) + hiện "Tổng 802".
- Avatar nhỏ (initials) thay placeholder xám to; ẩn field trống thay vì "—" trơ.
- Nút "Thêm bệnh nhân" giữ ở PageHeader.

**Non-functional**
- Tablet: table scroll ngang trong container (overflow-x-auto), không vỡ trang. i18n cột. <200 dòng (tách table config).

## Related Code Files
**Modify:** `src/routes/_authenticated/patients.index.tsx`. **Reuse:** DataTable (P01). **Create (tùy chọn):** `src/components/patient/patients-table.tsx`.

## Todo List
- [ ] Table cột + hàng click → detail
- [ ] Sort header + phân trang + tổng
- [ ] Avatar initials + ẩn field trống
- [ ] i18n + tablet overflow + screenshot verify

## Success Criteria (playwright)
- /patients hiện table gọn, nhiều hàng/màn, có sort + phân trang; không còn card thưa/"—" trơ.

## Risks
- **Phân trang backend** — dùng đúng API sẵn có (không kéo hết 802). Kiểm query.

## Next
- P03 workspaces.
