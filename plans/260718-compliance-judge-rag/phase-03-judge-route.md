# Phase 03 — Route /api/compliance-judge + RAG + hậu-kiểm citation

## Overview
- **Priority:** cao (trục Judge). Phụ thuộc: P02 (deterministic), P01 (bảng audit).
- **Status:** pending.
- Route server TanStack Start, tái dùng nguyên pattern `src/routes/api/copilot.ts`.

## Key Insights
- Server route API v1.168: `createFileRoute('/api/compliance-judge')({ server: { handlers: { POST } } })`. KHÔNG `createServerFileRoute`.
- Auth = JWT user (anon key + Authorization) → RLS. `loadCopilotEnv()` (đổi tên dùng chung → `loadServerEnv` tùy chọn; 24h: import lại `loadCopilotEnv`).
- `kb_search` RPC ký `{ p_query, p_embedding (JSON.stringify), p_k }` trả rows `{ citation, content, page_start, chunk_id? }`. **Kiểm return shape thực tế** (tools.ts đọc citation/content/page_start; cần thêm định danh chunk để hậu-kiểm — nếu RPC chưa trả `id`/`chunk_id`, đọc lại RPC kb_search và bổ sung cột trả về trong 1 migration nhỏ `CREATE OR REPLACE`).
- Structured output: dùng `generateObject` (ai SDK) với zod schema thay `generateText` để ép JSON.

## Requirements
**Functional** — `POST /api/compliance-judge`:
1. Auth JWT (giống copilot.ts). Parse body `{ patient_id, procedure_type, decisions: [{rule_id, keep, reason}] }`. Validate.
2. **Lớp A:** `runDeterministic(supabase, {...})` → `hard_findings`.
3. **Lớp B RAG:**
   - Query truy hồi = nhãn vi `procedure_type` + nhãn các `safety_flag` (vd "nhổ răng chống đông warfarin").
   - `embed` (text-embedding-3-small) → `kb_search` p_k=8 → `chunks` (giữ tập `allowedCitations` = định danh chunk trả về).
   - `generateObject` gpt-4o-mini temp 0, `system = JUDGE_PROMPT`, schema `AdvisorySchema` (mảng `{message, citations:[{doc, article?, page?, chunk_ref}], }` + `insufficient:[{topic, note}]`).
   - **HẬU-KIỂM citation:** bỏ mọi advisory có ≥1 citation `chunk_ref` KHÔNG thuộc `allowedCitations`; nếu advisory sạch nhưng rỗng citation → chuyển sang `insufficient`. Log số bị drop.
4. `verdict = hard_findings.some(high) || advisories.length ? 'has_findings' : 'clean'`.
5. Ghi `compliance_judgments` (findings jsonb, verdict, patient, procedure, visit_session_id). Trả `{ judgment_id, hard_findings, advisories, insufficient, verdict }`.
6. Action `ack` (cùng route, `?action=ack` hoặc field): nhận `{ judgment_id, ack_reasons }` → UPDATE row `acked_by`, `ack_reasons`. (UI gọi khi bác sĩ xác nhận.)

**Non-functional**
- temperature 0, retry LLM 1 lần, timeout mềm; lỗi LLM → trả `hard_findings` + `advisories:[]` + `insufficient:[{topic:'rag', note:'không truy hồi được, chỉ có kiểm tra tất định'}]` (fail-safe: Lớp A vẫn chạy).
- File route <200 dòng → tách `prompt.ts`, `schema.ts`, `citation-guard.ts`, `rag.ts`.

## Related Code Files
**Create**
- `src/routes/api/compliance-judge.ts` — handler POST + ack.
- `src/server/judge/prompt.ts` — `JUDGE_PROMPT` (biến thể chặt của copilot system-prompt: mỗi ý phải citation; không có → insufficient; cấm suy diễn/kết luận lâm sàng).
- `src/server/judge/schema.ts` — zod schema output Lớp B.
- `src/server/judge/citation-guard.ts` — `filterCitedAdvisories(advisories, allowedCitations)`.
- `src/server/judge/rag.ts` — `retrieve(openai, supabase, query)` → `{ chunks, allowedCitations }`.

**Reuse:** `src/server/copilot/env.ts`, `@ai-sdk/openai`, `kb_search` RPC, `runDeterministic` (P02).

**Modify (nếu cần):** migration nhỏ `CREATE OR REPLACE kb_search` để trả `chunk_id` phục vụ hậu-kiểm (nếu chưa có).

## Implementation Steps
1. Kiểm return shape `kb_search` → chốt định danh chunk cho hậu-kiểm (bổ sung cột nếu thiếu).
2. `rag.ts` + `schema.ts` + `prompt.ts` + `citation-guard.ts`.
3. Route: auth → Lớp A → Lớp B → hậu-kiểm → ghi audit → trả JSON. + nhánh ack.
4. `tsc --noEmit` + `npm run build`.

## Todo List
- [ ] Xác nhận/bổ sung chunk_id trong kb_search return
- [ ] rag.ts (embed + kb_search + allowedCitations)
- [ ] schema.ts (zod) + prompt.ts (JUDGE_PROMPT) + citation-guard.ts
- [ ] route compliance-judge.ts (POST + ack) + ghi audit
- [ ] fail-safe khi LLM lỗi (vẫn trả Lớp A)
- [ ] build sạch

## Success Criteria
- Trả JSON đúng schema; mọi `advisories[].citations` đều map được vào chunk lượt đó (0 citation ma — kiểm bằng inject citation giả trong test unit của guard).
- LLM chết → route vẫn trả hard_findings (không 500 toàn phần).
- Ghi 1 row `compliance_judgments`; ack cập nhật `acked_by`.

## Risk Assessment
- **kb_search không trả chunk_id** → không hậu-kiểm được → PHẢI bổ sung; đây là điều kiện tiên quyết của "không sai".
- **Latency 2-4s** → chấp nhận (modal spinner); Lớp A trả nhanh có thể hiện trước (P04).
- **generateObject không theo schema** → SDK tự retry; fallback insufficient.

## Security
- JWT→RLS toàn bộ tool đọc. Không service role. Prompt cấm lộ chain-of-thought.

## Next Steps
- P04 gọi route này tại `sign()`.
