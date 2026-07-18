# Phase 04 — UI modal tại điểm ký (ack + lý do)

## Overview
- **Priority:** cao (mặt tương tác của gác cổng). Phụ thuộc: P03 (route).
- **Status:** pending.
- Chèn Judge giữa `sign()` và `insertSignedOrders` trong `OrderDraftPanel`.

## Key Insights
- `OrderDraftPanel.sign()` (order-draft-panel.tsx:72) hiện gọi thẳng `insertSignedOrders`. Có sẵn `decisionList: DraftDecision[]` (`{draft, keep, exceptionReason}`) → map thành `decisions:[{rule_id: draft.id, keep, reason: exceptionReason}]` cho route.
- Đã có mẫu dialog (`ExceptionDialog`, shadcn Dialog) để theo.
- Giữ Human-first: `hard_findings` severity high → **chặn mềm** (mỗi finding một ô lý do bắt buộc); `advisories`/`insufficient` chỉ hiển thị; `verdict='clean'` → cho ký thẳng (vẫn show tóm tắt "đã kiểm, không phát hiện").

## Requirements
**Functional**
- `sign()` sửa: set `judging=true` → `POST /api/compliance-judge` với `{patient_id, procedure_type: proc, decisions}` → mở `ComplianceJudgeDialog` với kết quả (không gọi insertSignedOrders ngay).
- `ComplianceJudgeDialog`:
  - Header verdict (clean = xanh "Không phát hiện" / has_findings = vàng).
  - `hard_findings`: thẻ đỏ, mỗi finding severity high có `<Textarea>` lý do bắt buộc (nút "Ký" disabled tới khi mọi lý do high được nhập).
  - `advisories`: thẻ vàng + **citation chips** (doc/Điều/trang) — hiện nguyên văn nguồn để người kiểm.
  - `insufficient`: thẻ xám "chưa đủ căn cứ — cần đối chiếu thêm".
  - Nút "Ký xác nhận" → gọi route `ack` (judgment_id + ack_reasons) → rồi `insertSignedOrders(...)` (giữ nguyên) → toast → reset. Nút "Quay lại chỉnh" đóng dialog.
- Lỗi route (mạng) → toast + cho phép thử lại; KHÔNG âm thầm bỏ qua Judge.

**Non-functional**
- Component <200 dòng, tách khỏi panel.
- i18n vi+en cho mọi label mới. `t()` không interpolate → `.replace()`.

## Related Code Files
**Create**
- `src/components/dentist/compliance-judge-dialog.tsx` — dialog + state ack reasons.
- (tùy chọn) `src/components/dentist/citation-chip.tsx` — chip nguồn (nếu tái dùng với copilot).

**Modify**
- `src/components/dentist/order-draft-panel.tsx` — `sign()` gọi Judge trước; thêm state `judgeResult`, `judging`.
- `src/lib/i18n.tsx` — keys: judge_title, judge_clean, judge_hard_findings, judge_advisories, judge_insufficient, judge_ack_reason_required, judge_confirm_sign, judge_back, judge_missing_mandatory, judge_safety_flag, judge_checked_note… (vi+en).

## Implementation Steps
1. Map `decisionList` → payload; thêm fetch (kèm `supabase.auth.getSession()` token như use-copilot-chat.ts).
2. `ComplianceJudgeDialog` render 3 nhóm + ô lý do; disable "Ký" tới khi đủ lý do high.
3. Ký: `ack` → `insertSignedOrders` → invalidate queries (giữ logic cũ).
4. i18n keys. `tsc` + build.

## Todo List
- [ ] sign() gọi /api/compliance-judge trước insertSignedOrders
- [ ] ComplianceJudgeDialog (hard/advisory/insufficient + citation chips)
- [ ] Chặn mềm: lý do bắt buộc cho hard high
- [ ] ack → insertSignedOrders
- [ ] i18n vi+en

## Success Criteria
- Ký khi thiếu mandatory → dialog chặn tới khi nhập lý do; ký được sau khi nhập.
- advisory hiện citation chips khớp nguồn; insufficient hiện khi không đủ căn cứ.
- verdict clean → ký 1 chạm (vẫn qua dialog xác nhận ngắn).
- Judge lỗi mạng → không ký lén; báo lỗi + thử lại.

## Risk Assessment
- **Bác sĩ bỏ qua Judge** → không có đường vòng: `sign()` chỉ tới `insertSignedOrders` qua dialog.
- **Latency** → spinner "Đang đối chiếu…"; Lớp A có thể render trước khi Lớp B xong (nếu tách stream; 24h: chờ cả gói).

## Security
- Token JWT gửi kèm; route áp RLS. Không lộ service key.

## Next Steps
- P05 chạy 4 kịch bản trên UI thật.
