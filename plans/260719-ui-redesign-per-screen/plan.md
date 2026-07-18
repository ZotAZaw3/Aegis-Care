---
title: UI Redesign — Per-Screen Data-Dense
status: done (P01-05 verified playwright; deferred: login-flash fix, sidebar tablet-drawer)
created: 2026-07-19
builds_on: [260719-ui-role-workspaces]
blockedBy: []
blocks: []
---

# UI Redesign — Per-Screen Data-Dense — Overview

**Vấn đề (bằng chứng prod, playwright 2026-07-19):** plan UI trước chỉ đổi **điều hướng (IA) + token màu** — layout/thẩm mỹ **vẫn là component cũ**. User đúng: "chưa refactor giao diện". Đây là plan **thiết kế lại bố cục từng màn** theo Data-Dense (`design-system/aegis-care/MASTER.md`), KHÔNG phải đổi token.

**Lỗi cụ thể đã quan sát trên prod:**
- Breadcrumb hiện `clinic` (raw route, chưa dịch).
- Sidebar **chỉ icon, không nhãn** → vi phạm nav-label-icon, khó dùng.
- `/clinic` trống ~60% màn — mật độ thấp, ngược Data-Dense.
- `/patients`: **card grid TO/thưa cho 802 BN** thay vì table gọn; field "—"; avatar đơn điệu; thiếu filter/sort/phân trang.
- Tổng: bố cục = component cũ khoác màu mới.

## Nguyên tắc
Bám `design-system/aegis-care/MASTER.md` (Data-Dense) + **page overrides** (check `pages/[page].md` TRƯỚC MASTER): `pages/patients.md`, `pages/dashboard.md` (đã tạo qua /ui-ux-pro-max). Additive (giữ route/logic/backend, chỉ đổi bố cục+style) · **dùng skill thiết kế** (design-taste-frontend / frontend-design) tạo mockup trước khi code · a11y · responsive 768/1024/1440 + tablet.

## UX guidelines (đã query /ui-ux-pro-max — áp mọi phase)
- **Table**: rộng → horizontal-scroll trong container (KHÔNG vỡ layout); reserve space async (chống content-jump, CLS); deep-link URL cho filter/sort/trang; (tùy chọn) multi-select + bulk action.
- **Nav**: active-state rõ (màu/underline). **Z-index**: scale hệ thống (10/20/30/50), không số tùy tiện. **Container**: giới hạn max-width text 65-75ch; dùng dvh không 100vh.
- **Empty state**: message + action (không màn trắng). Loading: skeleton reserve space.

## Chiến lược (khác lần trước — lần này redesign THẬT)
Mỗi màn: (1) chốt pattern Data-Dense (table/kpi/list), (2) mockup nhanh, (3) code lại bố cục dùng component/logic sẵn có nhưng layout mới, (4) verify bằng playwright screenshot (không chỉ tsc).

## Phases
| # | Phase | Ưu tiên | File |
|---|---|---|---|
| 01 | Foundation: sidebar có nhãn+nhóm · breadcrumb i18n · header · density tokens · DataTable primitive | cao (nền) | [phase-01](phase-01-foundation.md) |
| 02 | Patients → Data-Dense table (filter/sort/phân trang) | cao (lỗi rõ nhất) | [phase-02](phase-02-patients-table.md) |
| 03 | Workspaces (/clinic /execution /lab) bố cục + quick-stats + empty đẹp | cao | [phase-03](phase-03-workspaces.md) |
| 04 | Dashboard Ops + Patient detail redesign | trung bình | [phase-04](phase-04-dashboard-detail.md) |
| 05 | Consistency/polish/responsive/a11y sweep + verify playwright | trung bình | [phase-05](phase-05-polish-verify.md) |

## Ràng buộc
Giữ backend/RPC/route/logic · TanStack Router file-based · shadcn/ui + Tailwind (đã có table.tsx) · file <200 dòng · i18n vi+en · KHÔNG thêm lib nặng · **verify bằng screenshot playwright mỗi phase** (rút kinh nghiệm: tsc sạch ≠ nhìn khác).

## Quan hệ plan
- Tiếp nối `260719-ui-role-workspaces` (IA + token đã xong) — plan này lo **layout/thẩm mỹ** còn thiếu. Không phá IA.
