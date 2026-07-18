# Phase 05 — Consistency/polish/responsive/a11y sweep + verify playwright

## Context
- Toàn bộ màn sau P01-04, `design-system/aegis-care/MASTER.md` checklist, ui-ux-pro-max guidelines.

## Overview
- **Priority:** trung bình — pass thống nhất cuối. Đảm bảo cả app 1 thể + verify THẬT bằng screenshot (rút kinh nghiệm: tsc sạch ≠ nhìn khác).

## Requirements
**Functional**
- **Consistency**: mọi màn dùng PageHeader + spacing/density đồng nhất; status color (open/overdue/done) token chung (`shared/status-badge.tsx`); tabular-nums mọi số; card/hover 150-300ms transition (MASTER anti-pattern: instant/no-transition).
- **Empty states**: mọi list rỗng dùng EmptyState (icon+message) — không dòng chữ trơ.
- **Responsive**: sweep 768/1024/1440 + tablet; sidebar drawer <1024; table overflow; không horizontal-scroll.
- **A11y**: contrast 4.5:1 (kiểm light+dark), focus ring, aria-label mọi icon button, keyboard nav, prefers-reduced-motion.
- **Cursor/hover**: cursor-pointer mọi clickable; row hover highlight (Data-Dense key effect).

**Non-functional**
- KHÔNG đụng logic. Verify từng breakpoint bằng playwright screenshot.

## Related Code Files
**Create:** `src/components/shared/status-badge.tsx`. **Modify:** rải rác (token/class/aria) — giới hạn cứng: token+shell+primitive+a11y.

## Todo List
- [ ] status-badge token chung + áp
- [ ] Empty states toàn app (EmptyState)
- [ ] Responsive 768/1024/1440 + tablet (screenshot mỗi cỡ)
- [ ] A11y sweep (contrast/focus/aria/keyboard/reduced-motion)
- [ ] cursor-pointer + row hover + transition
- [ ] Screenshot verify toàn bộ màn chính (login từng vai)

## Success Criteria (playwright, nhiều breakpoint)
- Cả app 1 thể Data-Dense; screenshot chứng minh khác rõ bản cũ; pass a11y checklist MASTER.md.

## Risks
- **Polish vô tận** → giới hạn: token+empty+responsive+a11y. KHÔNG redesign lại (đã làm P01-04).

## Next
- Xong → commit + push (user redeploy). Cập nhật plan + journal.
