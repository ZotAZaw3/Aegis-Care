# Phase 06 — Visual/perf/a11y pass (Data-Dense tokens + lazy + responsive)

## Context
- `design-system/aegis-care/MASTER.md` (Data-Dense Dashboard, primary #2563EB, WCAG AA), `src/index.css`/Tailwind tokens, 3 primitive (P01), recharts (manager Ops), route tree.

## Overview
- **Priority:** trung bình — pass thống nhất cuối, sau khi 5 workspace có nội dung (P01-05).
- KHÔNG redesign từng component — chỉ chuẩn hóa token + shell + perf + a11y theo MASTER.md. Giới hạn cứng tránh "vô tận".

## Key Insights
- Design system persisted → bám `design-system/aegis-care/MASTER.md` làm nguồn. Primary #2563EB đã trùng charts → ít đổi.
- Data-Dense: minimal padding, grid, KPI cards, tabular-nums, **filtering bắt buộc** (đã làm ở list P02-05).
- Perf: route-level lazy (TanStack Router tự split theo route) + recharts nặng → lazy import trong Ops component (chỉ /dashboard admin tải).

## Requirements
**Functional**
- **Tokens**: chuẩn hóa status color (open/routed/in_progress=warning, overdue=destructive, closed/done=success) thành class/token dùng chung; primary #2563EB; tabular-nums cho mọi số. Áp qua primitive + util `status-badge`.
- **Shell**: header sticky + padding bù (không che content), sidebar active state (có), spacing 4/8 nhịp.
- **Perf**: lazy recharts (Ops) — `React.lazy` hoặc dynamic; kiểm bundle. Route split tự động.
- **Responsive**: kiểm 768/1024/1440; reception/lab tablet touch ≥44px; không horizontal-scroll; sidebar collapse ở hẹp.
- **A11y checklist** (CRITICAL): contrast text ≥4.5:1; focus ring hiển thị; aria-label cho icon-only button (alerts-bell, copilot toggle, sidebar collapse); keyboard nav; prefers-reduced-motion.

**Non-functional**
- Không thêm lib. Giữ shadcn tokens. Đổi font sang Fira (MASTER gợi ý) là TÙY CHỌN — chỉ nếu không phá; ưu tiên tabular-nums hơn đổi font.

## Related Code Files
**Create:** `src/components/shared/status-badge.tsx` (nếu chưa). **Modify:** `src/index.css`/tailwind config (token status), Ops component (lazy recharts), primitive, icon buttons (aria-label), i18n nếu thêm nhãn.

## Implementation Steps
1. Status token/badge dùng chung; áp vào các list workspace.
2. Lazy recharts trong Ops; kiểm build.
3. Responsive sweep 768/1024/1440 + tablet touch.
4. A11y sweep (contrast, focus, aria-label, keyboard, reduced-motion).
5. `tsc` + `npm run build` + kiểm tay theo `design-system/aegis-care/MASTER.md` checklist.

## Todo List
- [ ] Status token/badge thống nhất + tabular-nums
- [ ] Lazy recharts (Ops)
- [ ] Responsive 768/1024/1440 + tablet ≥44px
- [ ] A11y: contrast/focus/aria-label/keyboard/reduced-motion
- [ ] Build sạch + checklist MASTER.md

## Success Criteria
- Cả app cảm giác 1 thể (token status/spacing/số nhất quán) theo MASTER.md.
- Ops chart lazy (không tải ở non-admin). Không horizontal-scroll ở 768.
- Pass a11y checklist (contrast 4.5:1, focus ring, aria-label icon btn).

## Risks
- **Visual pass "vô tận"** → giới hạn: token + shell + 3 primitive + a11y checklist. KHÔNG đụng logic component.
- **Đổi font** dễ phá layout → tùy chọn, chỉ khi dư thời gian.

## Security
- Không đổi bề mặt bảo mật (thuần UI).

## Next
- Kết thúc plan. Cân nhắc role switcher + Supabase realtime cho queue (ngoài scope).
