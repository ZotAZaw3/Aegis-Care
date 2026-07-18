---
title: UI Unification — Role-based Workspaces
status: code-complete (P01-06; verify tay UI + a11y/responsive khi drive app)
created: 2026-07-19
builds_on: [260718-0111-order-centric-clinic-system, 260718-ai-meeting-copilot, 260719-emr-observations-labs]
blockedBy: []
blocks: []
---

# UI Unification — Role-based Workspaces — Overview

Backend đã đầy đủ nhưng UI rời rạc: **component giàu, route nghèo** (chỉ 8 route) → nhiều tính năng backend "mồ côi" (ký y lệnh+Judge, thực thi y lệnh assistant, chờ duyệt, labs, lab-tech nhập KQ). Không có "home theo vai". Hợp nhất thành **1 shell + 5 workspace theo vai** để dùng trọn backend, **tách biệt user theo role**.

**Đã validate qua /ui-ux-pro-max** (design-system persisted → `design-system/aegis-care/MASTER.md`): style **Data-Dense Dashboard**, primary `#2563EB` (trùng charts hiện có), WCAG AA. Guidelines áp: adaptive-nav (≥1024 sidebar), deep-linking (route riêng/vai), empty-states, no-filtering anti-pattern (mọi list có filter), avoid-mixed-nav-patterns, number-tabular.

## Nguyên tắc
Human-first theo vai (mỗi home chỉ hiện việc của vai) · **Additive** (giữ luồng cũ `/visits/$id`, `/patients`) · dùng lại component sẵn có (reception/dentist/assistant/manager) · **KHÔNG đụng backend** (chỉ IA+UI) · desktop-first, tablet cho reception/lab · file <200 dòng · i18n vi+en · bám MASTER.md.

## Kiến trúc: 1 shell + 5 workspace
- **Shell** (header: logo/alerts-bell/copilot toggle/user menu/language + **sidebar theo vai** + content; copilot floating giữ). **Redirect sau login theo vai** (KHÔNG cứng khi multi-role → nhớ workspace cuối / chọn).
- **Workspace** (home + nav + gom component): Reception `/reception` · Dentist `/clinic` (MỚI) · Assistant `/execution` (MỚI) · Lab `/lab` (MỚI + **P05 nhập KQ**) · Admin `/dashboard` (Ops tách riêng).
- **3 primitive dùng lại**: `PageHeader`, `EmptyState`, `SectionCard` → mọi trang cùng nhịp.

## Phases
| # | Phase | Ưu tiên | File |
|---|---|---|---|
| 01 | Shell + role sidebar + login redirect/workspace + 3 primitive | cao (nền) | [phase-01](phase-01-shell-primitives.md) |
| 02 | Dentist `/clinic` (hàng đợi khám + chờ duyệt) | cao (demo) | [phase-02](phase-02-dentist-clinic.md) |
| 03 | Lab `/lab` + **P05 form nhập KQ** (đóng đường lab sống) | cao | [phase-03](phase-03-lab-workspace.md) |
| 04 | Assistant `/execution` (thực thi y lệnh) | trung bình | [phase-04](phase-04-assistant-execution.md) |
| 05 | Reception polish (tablet) + Admin nav + tách Ops + Labs tab | trung bình | [phase-05](phase-05-reception-admin.md) |
| 06 | Visual/perf/a11y pass (Data-Dense tokens + lazy + responsive) | trung bình | [phase-06](phase-06-visual-perf-a11y.md) |

## Dependencies (backend đã có, không block)
RPC/route: get_safety_panel(+observations), get_observation_history, get_ops_metrics/trends, order_violations, pending_review_orders, /api/compliance-judge, /api/copilot, /api/ops-report; lab_orders + trigger emit clinic (P05 backend đã ship). Component: reception/dentist/assistant/manager/*. `useAuth().roles` (5 vai). recharts, shadcn/ui.

## Quan hệ plan
- **Hoàn thành P05-UI** còn treo của `260719-emr-observations-labs` (backend trigger đã ship; plan này xây form nhập).
- Tách Ops component (`260718-ai-meeting-copilot`) khỏi `/dashboard` chung sang workspace admin — additive, không phá.

## Ràng buộc
TanStack Router `createFileRoute` (KHÔNG createServerFileRoute) · route tree generated · giữ `/visits/$id` `/patients` · mọi list: filter+EmptyState+Skeleton · a11y: contrast 4.5:1, focus ring, aria-label icon btn, keyboard nav · tabular-nums cho số · không thêm lib.
