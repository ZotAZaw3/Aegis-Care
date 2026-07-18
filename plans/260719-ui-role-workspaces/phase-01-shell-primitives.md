# Phase 01 — Shell + role sidebar + login redirect/workspace + 3 primitive

## Context
- `src/routes/_authenticated/route.tsx` (shell layout), `src/components/app-sidebar.tsx` (nav), `src/routes/index.tsx` (redirect sau login), `src/lib/auth.tsx` (roles, useHasRole), `design-system/aegis-care/MASTER.md`.

## Overview
- **Priority:** cao — nền cho mọi workspace. Độc lập.
- Tách nav theo vai + redirect theo vai + primitive dùng lại. Chưa build nội dung workspace (P02-05).

## Key Insights
- Sidebar đã có helper `has(...roles)` (admin thấy hết). Mở rộng items theo vai, KHÔNG 1 kiểu cho tất cả.
- Redirect hiện: `index.tsx` user→`/dashboard`. Đổi thành home theo vai + nhớ `last_workspace` (localStorage). Multi-role: last_workspace hợp vai → dùng; else resolveHome theo ưu tiên.
- 5 vai: admin, dentist, assistant, receptionist, lab_technician (`AppRole`).
- **avoid-mixed-nav-patterns**: desktop = sidebar (đã có, collapsible icon). Tablet reception/lab để P05/P03 xử responsive (drawer), KHÔNG thêm bottom nav lẫn lộn.

## Requirements
**Functional**
- `resolveHome(roles)`: admin→`/dashboard`, dentist→`/clinic`, assistant→`/execution`, lab_technician→`/lab`, receptionist→`/reception`, fallback `/dashboard`. Ưu tiên theo thứ tự đó khi multi-role.
- Redirect sau login (index.tsx + `_authenticated/route.tsx` nếu vào root): dùng `last_workspace` (localStorage, set khi đổi route workspace) nếu hợp vai, else `resolveHome`.
- Sidebar items theo vai: Dashboard(admin) · Phòng khám`/clinic`(dentist) · Thực thi`/execution`(assistant) · Lab`/lab`(lab_technician) · Tiếp đón`/reception`(receptionist,assistant) · Bệnh nhân`/patients`(all) · Follow-ups(dentist,receptionist) · CRM(admin) · Quản trị`/admin`(admin). `nav-state-active` giữ (border-l active có sẵn).
- Route stubs `/clinic` `/execution` `/lab` (component tối giản "đang tải" — nội dung ở P02-04) để link + redirect hoạt động, route tree regen.
- 3 primitive: `src/components/shared/page-header.tsx` (title + actions slot), `empty-state.tsx` (icon+message+action), `section-card.tsx` (Card + header chuẩn). i18n-ready.

**Non-functional**
- File <200 dòng. Không phá `/dashboard` `/patients` `/visits/$id`. i18n vi+en nhãn nav mới.

## Related Code Files
**Create:** `src/components/shared/{page-header,empty-state,section-card}.tsx`; route stubs `src/routes/_authenticated/{clinic,execution,lab}.tsx`; `src/lib/resolve-home.ts`.
**Modify:** `src/components/app-sidebar.tsx`, `src/routes/index.tsx` (+ `_authenticated/route.tsx` nếu cần), `src/lib/i18n.tsx`.

## Implementation Steps
1. `resolve-home.ts` + dùng ở index.tsx redirect + set last_workspace khi vào route workspace.
2. Sidebar items theo vai (mở rộng mảng + `has()`).
3. Route stubs 3 workspace (placeholder) → `npm run build` regen route tree.
4. 3 primitive + i18n. `tsc` + build.

## Todo List
- [ ] resolve-home + redirect theo vai + last_workspace
- [ ] Sidebar items theo vai (5 vai)
- [ ] Route stubs /clinic /execution /lab
- [ ] PageHeader/EmptyState/SectionCard + i18n
- [ ] tsc + build sạch

## Success Criteria
- Login từng vai → về đúng home; multi-role nhớ workspace cuối.
- Sidebar mỗi vai chỉ hiện mục của vai (admin thấy hết).
- 3 primitive render, route tree có /clinic /execution /lab.

## Risks
- **Multi-role confuse** → last_workspace + ưu tiên rõ; role switcher để sau (YAGNI).
- **Route tree generated** → chạy build regen (như các route trước).

## Security
- Route stubs vẫn trong `_authenticated` (đã gate đăng nhập). Gate theo vai ở nội dung (P02+) + RLS backend.

## Next
- P02-05 đổ nội dung vào stubs. P06 áp token MASTER.md.
