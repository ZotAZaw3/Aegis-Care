# Phase 04 — Copilot patient_labs tool + i18n

## Context
- `src/server/copilot/tools.ts` (Zod tools: find_patient, patient_history, safety_panel, crm_recall…), `system-prompt.ts` (retrieval-only), `src/components/copilot/` (CopilotProvider setPatient).

## Overview
- **Priority:** trung bình. Phụ thuộc P01+P02 (get_observation_history).
- Cho copilot trích dẫn kết quả xét nghiệm (kèm ngày) khi hỏi về BN. Retrieval-only, narrate fact.

## Key Insights
- Đã có tool `patient_history`/`safety_panel` gọi RPC dưới JWT người dùng (RLS). Thêm tool `patient_labs` gọi `get_observation_history` (P02) — pattern y hệt.
- System prompt đã cưỡng chế retrieval-not-inference → tool trả value+ngày+ref, LLM chỉ thuật.

## Requirements
**Functional**
- `tools.ts`: tool `patient_labs` — input `{ patient_id: string, codes?: string[] }` (Zod); gọi `supabase.rpc("get_observation_history", { p_patient_id, p_codes })`; trả mảng {label_vi, value, unit, observed_at, ref_low, ref_high}. Mô tả tool: "Kết quả xét nghiệm/labs đã ghi của bệnh nhân (INR, HbA1c, HA, đường huyết…). Chỉ trả dữ kiện + ngày."
- system-prompt.ts: 1 câu nhắc dùng patient_labs cho câu hỏi về xét nghiệm; nhắc CHỈ thuật số + ngày, KHÔNG diễn giải bất thường.
- i18n: nhãn nếu UI copilot hiển thị tên tool (nếu có tool_calls badge).

**Non-functional**
- tools.ts giữ gọn (đang ~6.8K) — thêm 1 tool. Không thêm lib.

## Related Code Files
**Modify:** `src/server/copilot/tools.ts`, `src/server/copilot/system-prompt.ts`, `src/lib/i18n.tsx` (nếu cần nhãn).

## Implementation Steps
1. Thêm tool patient_labs (Zod + gọi RPC).
2. Nhắc trong system-prompt.
3. `tsc` + build; test hỏi copilot "INR của bệnh nhân X" → trả value+ngày có citation.

## Todo List
- [ ] Tool patient_labs (get_observation_history)
- [ ] System prompt nhắc dùng + ranh giới
- [ ] build sạch + test hỏi copilot

## Success Criteria
- Hỏi "kết quả INR/HbA1c của BN?" → copilot trả số + ngày, KHÔNG phán bất thường, KHÔNG bịa.
- Non-staff (nếu có) không truy được (RLS trong RPC).

## Risks
- **LLM diễn giải bất thường** → system-prompt cấm + tool chỉ trả fact (đã theo pattern anti-hallucination hiện có).

## Security
- JWT→RLS như mọi tool copilot; không service role.

## Next
- Độc lập với P05/P06.
