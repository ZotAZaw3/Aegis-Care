# Phase 03 — Compliance Judge ghép value observation cạnh cờ hệ thống (killer demo)

## Context
- `src/server/judge/deterministic.ts` (Lớp A đọc get_safety_panel → safety_flag), `src/server/judge/types.ts` (HardFinding), `src/routes/api/compliance-judge.ts`.

## Overview
- **Priority:** cao — demo mạnh nhất: "BN warfarin + INR 3.5" hiện ngay điểm ký y lệnh. Phụ thuộc P01+P02 (get_safety_panel đã có `observations`).
- CHỈ thuật sự thật (value + ngày). Bác sĩ quyết. KHÔNG "đừng nhổ".

## Key Insights
- Lớp A đã đọc `get_safety_panel` → chỉ cần đọc thêm `safety.observations` (P02 đã thêm), phát HardFinding loại `observation_fact` cho lab liên quan.
- Ghép ngữ cảnh: observation có `related_flag` khớp cờ hệ thống đang có (vd anticoagulant) → nêu value CẠNH cờ. Với thủ thuật chảy máu (extraction/implant/biopsy) ưu tiên nêu INR/tiểu cầu/PT/aPTT.
- Vẫn hard_finding = chặn mềm (ack + lý do), giữ human-first — như safety_flag hiện tại.

## Requirements
**Functional**
- `types.ts`: thêm `'observation_fact'` vào union `HardFinding.type`.
- `deterministic.ts`: sau vòng systemic_flags, lặp `safety.observations`; với mỗi observation thuộc nhóm bleeding HOẶC có related_flag khớp 1 systemic_flag đang có → push finding:
  - message = `${label_vi}: ${value} ${unit} (đo ${observed_at}, tham chiếu ${ref_low}–${ref_high}) — dữ kiện đã ghi.`
  - severity: 'medium' (fact, không tự phán cao/thấp). ref = loinc_code.
- KHÔNG so sánh value với ref để phán "cao" (inference). Chỉ đính kèm ref như dữ kiện.
- compliance-judge.ts: `buildJudgeContext` truyền thêm observation facts vào phần safetyFacts (LLM Lớp B narrate, đã có guard citation) — tùy chọn, giữ tối giản.

**Non-functional**
- Tái lập 100%, không LLM ở Lớp A. File deterministic.ts giữ <200 dòng (đang ~90).

## Related Code Files
**Modify:** `src/server/judge/types.ts`, `src/server/judge/deterministic.ts` (+ tùy chọn `prompt.ts` buildJudgeContext).

## Implementation Steps
1. types.ts thêm loại finding.
2. deterministic.ts đọc safety.observations → phát observation_fact (lọc nhóm bleeding + related_flag match).
3. (tùy chọn) đưa vào safetyFacts cho Lớp B.
4. `tsc` + build; test tay 1 BN warfarin+INR ký extraction → thấy finding INR.

## Todo List
- [ ] types.ts +observation_fact
- [ ] deterministic.ts phát finding lab (fact, no verdict)
- [ ] build sạch + test tay demo INR

## Success Criteria
- Ký extraction cho BN có INR → dialog Judge hiện "INR x.x (đo …, tham chiếu 0.8–1.2)" cạnh cờ chống đông.
- KHÔNG câu "cao/nguy hiểm/đừng làm". Ack + lý do vẫn hoạt động (audit compliance_judgments).

## Risks
- **BN demo không có INR** → phụ thuộc P01 verify/force-seed (bắt buộc xong trước).
- **Nhiễu nếu nêu mọi lab** → chỉ nêu nhóm bleeding + related_flag match, KHÔNG đổ hết vitals.

## Security
- Không đổi bề mặt auth; chạy dưới JWT như route hiện tại (RLS).

## Next
- P04 copilot; P06 ops metric dùng chung khái niệm "INR liên quan chống đông".
