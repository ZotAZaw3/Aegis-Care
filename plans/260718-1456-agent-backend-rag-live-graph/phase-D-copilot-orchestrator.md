# Phase D — Copilot orchestrator (Vercel AI SDK)

## Context Links
- Brainstorm §4, §6.3 (authoritative)
- Anti-hallucination prompt nguồn: `rag service/answer_generator.py` (SYSTEM_PROMPT — port nguyên tắc)
- Tools = RPC sẵn: `get_safety_panel`, `get_briefing_source`, `get_crm_recall` (`20260718060000`/`070000`), `order_violations`/`pending_review_orders` view, `kb_rules` (draft), `kb_search` (Phase C)
- Server route mẫu + client: `src/server.ts`, `src/integrations/supabase/client.ts`, `client.server.ts`
- Stack: `vite.config.ts` (TanStack Start + Nitro → server routes trên Vercel)

## Overview
- **Priority:** cuối. **Phụ thuộc:** Phase C (`kb_search`) + Phase A (data thật để curl-test).
- **Status:** pending.
- Server route `POST /api/copilot` nhận `{messages, patient_id?}`, chạy `generateText` (gpt-4o-mini) với ~6 tools tool-calling (~4 vòng), auth qua JWT user → RLS tự lo, trả JSON `{answer, citations[], tool_calls[]}`. Streaming-ready nhưng chưa stream. Test bằng curl (KHÔNG UI).

## Key Insights
- **Ranh giới bất biến:** agent tư vấn — engine thi hành — người quyết. Copilot KHÔNG kết luận lâm sàng, KHÔNG khuyến nghị điều trị; citation bắt buộc; context không nêu kết luận rõ → phải nói "cần đối chiếu thêm".
- **Lane1 qua LLM — phân biệt rõ:** tool `safety_panel` chỉ TRẢ DATA (dị ứng/thuốc/cờ bệnh nền) cho LLM đọc trong ngữ cảnh chat tư vấn. Đây KHÁC panel UI Lane1 bất biến (nguồn chính, deterministic, hard-query, KHÔNG LLM) — panel UI KHÔNG đổi, vẫn là nguồn an toàn chuẩn. Chat chỉ là lớp advisory phụ. GHI RÕ trong system prompt: "dữ liệu an toàn hiển thị ở đây là advisory; panel an toàn trên giao diện mới là nguồn quyết định".
- **Auth = JWT user:** đọc `Authorization: Bearer <jwt>` từ header → tạo supabase client với JWT đó (anon key + global header Authorization) → RLS áp theo user. Không JWT → 401. KHÔNG dùng service role trong route này (RLS phải sống).
- **OPENAI_API_KEY** từ server env (Vercel env var / `.dev.vars` local) — KHÔNG client, KHÔNG `VITE_`.
- AI SDK: `generateText({ model, tools, messages, stopWhen: stepCountIs(4) })`. Tool = `tool({ description, inputSchema: z..., execute })`.

## Requirements
**Functional**
- Route `POST /api/copilot`, body `{ messages: {role,content}[], patient_id?: string }`.
- 6 tools:
  1. `kb_search(query)` — embed query (OpenAI) → `rpc('kb_search',{p_query,p_embedding,p_k})` → chunks + citation.
  2. `safety_panel(patient_id)` — `rpc('get_safety_panel')` (advisory; xem Key Insights).
  3. `patient_history(patient_id)` — `rpc('get_briefing_source')` (bệnh sử nha, retrieval-only).
  4. `crm_recall(patient_id)` — `rpc('get_crm_recall')`.
  5. `open_violations(patient_id?)` — SELECT từ view `order_violations` (lọc theo patient nếu có).
  6. `order_drafts(procedure_type)` — SELECT `kb_rules` active theo procedure_type (nháp y lệnh gợi ý — KHÔNG tự tạo order).
- System prompt: ranh giới retrieval-only + port anti-hallucination từ `answer_generator.py`.
- Trả `{ answer, citations[], tool_calls[] }`. `citations` gom từ kết quả `kb_search`.
- 401 nếu thiếu/không hợp lệ JWT.

**Non-functional**: file route <200 dòng (tách tools sang module); không secret client; typecheck pass.

## Architecture
```
POST /api/copilot  (src/routes/api/copilot.ts — TanStack Start server route)
  ├─ verify JWT header → supabase = createClient(URL, ANON, { global:{ headers:{ Authorization }}})
  │     (KHÔNG service role — RLS sống theo user)
  ├─ generateText({
  │     model: openai('gpt-4o-mini'),
  │     system: SYSTEM_PROMPT,               // ranh giới + anti-hallucination
  │     messages,
  │     tools: buildTools(supabase, openai), // 6 tools, execute gọi supabase.rpc/from
  │     stopWhen: stepCountIs(4),
  │   })
  └─ trả JSON { answer: text, citations, tool_calls: steps.flatMap(toolCalls) }
```
Sketch route (pseudocode — xác nhận API `createServerFileRoute` theo version `@tanstack/react-start` đã cài):
```ts
// src/routes/api/copilot.ts
import { createServerFileRoute } from '@tanstack/react-start/server';
import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';
import { buildTools, SYSTEM_PROMPT } from '@/server/copilot/tools';

export const ServerRoute = createServerFileRoute('/api/copilot').methods({
  POST: async ({ request }) => {
    const jwt = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!jwt) return new Response('unauthorized', { status: 401 });
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { messages, patient_id } = await request.json();
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const citations: unknown[] = [];
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      messages,
      tools: buildTools({ supabase, openai, patient_id, citations }),
      stopWhen: stepCountIs(4),
    });
    return Response.json({
      answer: result.text,
      citations,
      tool_calls: result.steps.flatMap(s => s.toolCalls ?? []),
    });
  },
});
```
`src/server/copilot/tools.ts` (tách module, <200 dòng): 6 tool định nghĩa + `SYSTEM_PROMPT`. `kb_search.execute` embed query rồi rpc + push citation.

## Related Code Files
**Create**
- `src/routes/api/copilot.ts` — server route (thin, <120 dòng).
- `src/server/copilot/tools.ts` — 6 tools + buildTools.
- `src/server/copilot/system-prompt.ts` — SYSTEM_PROMPT (port answer_generator.py + ranh giới + Lane1-advisory disclaimer).
- `docs/copilot-curl-tests.md` (hoặc trong plan) — lệnh curl mẫu.

**Modify**
- `package.json` — thêm `ai`, `@ai-sdk/openai` (+ `zod` đã có).
- `.dev.vars` — `OPENAI_API_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon).
- Vercel env — `OPENAI_API_KEY`, `SUPABASE_URL`, anon key (đã có), KHÔNG service role.

**Delete** — không.

## Implementation Steps
1. `npm i ai @ai-sdk/openai`. Typecheck.
2. Viết `system-prompt.ts`: port SYSTEM_PROMPT từ `answer_generator.py` (không suy diễn sai chiều; context không nêu kết luận → "cần đối chiếu thêm"; không tìm thấy → nói rõ) + thêm: ranh giới retrieval-only, KHÔNG kết luận lâm sàng/khuyến nghị điều trị, citation bắt buộc, câu disclaimer Lane1-advisory.
3. Viết `tools.ts` với 6 tools (zod inputSchema). Mỗi `execute` gọi `supabase.rpc/from` (RLS theo JWT). `kb_search` embed OpenAI trước.
4. Viết route `copilot.ts` (verify API `createServerFileRoute` theo version cài — nếu khác, dùng cơ chế server route tương đương của TanStack Start). Gom citations, tool_calls.
5. `.dev.vars` đủ biến. `npm run dev`.
6. curl test (cần JWT thật của 1 staff — lấy qua đăng nhập Supabase hoặc `supabase.auth`):
   - KB: hỏi consent trước thủ thuật → trả lời + citation Điều/Khoản.
   - patient_history: `patient_id` BN warfarin (Phase A) → tóm tắt bệnh sử nha.
   - safety_panel: BN warfarin → data thuốc chống đông (kèm disclaimer advisory).
   - 401 khi thiếu Authorization.
7. Kiểm tool-calling ≤4 vòng (stopWhen). Kiểm không kết luận lâm sàng (thử prompt gài "tôi có nên nhổ răng không?" → phải từ chối/đối chiếu, không phán).
8. Typecheck + lint.

## Todo List
- [ ] `npm i ai @ai-sdk/openai`
- [ ] `system-prompt.ts` (port + ranh giới + Lane1 disclaimer)
- [ ] `tools.ts` 6 tools (zod + supabase RLS)
- [ ] `copilot.ts` server route + JWT + JSON response
- [ ] `.dev.vars` + Vercel env (KHÔNG service role)
- [ ] curl test 4 kịch bản + 401
- [ ] Test không-kết-luận-lâm-sàng
- [ ] typecheck + lint

## Success Criteria (đo được)
- `curl -X POST /api/copilot -H "Authorization: Bearer <jwt>" -d '{"messages":[{"role":"user","content":"Consent có bắt buộc trước thủ thuật không?"}]}'` → JSON có `answer` + `citations[]` ≥1 (citation Điều/Khoản/trang).
- Thiếu `Authorization` → HTTP 401.
- Với `patient_id` BN warfarin: tool `safety_panel` được gọi (trong `tool_calls`), answer nhắc thuốc chống đông + disclaimer "panel giao diện là nguồn quyết định".
- Prompt "tôi có nên nhổ răng không?" → KHÔNG đưa kết luận lâm sàng; trả lời đối chiếu/tư vấn quy trình.
- `tool_calls` length ≤ ~4 vòng; response < ~15s.
- Không secret trong bundle client (`grep -r OPENAI_API_KEY dist/` rỗng).

## Risk Assessment
- **API server-route TanStack Start khác version** → xác nhận `createServerFileRoute`/cơ chế đúng với `@tanstack/react-start@^1.168`; fallback: server route qua `src/routes/api/*.ts` export handler.
- **JWT hết hạn/không staff** → RLS trả rỗng (tool ra data rỗng, không lỗi); prompt xử lý "không tìm thấy".
- **LLM vượt ranh giới (kết luận lâm sàng)** → system prompt cứng + test gài; nhiệt độ 0.
- **Chi phí/độ trễ nhiều vòng tool** → stopWhen=4; gpt-4o-mini rẻ.
- **Lane1 qua LLM bị hiểu nhầm là nguồn chính** → disclaimer trong prompt + ghi rõ panel UI bất biến vẫn deterministic; đây là advisory chat. (Ghi trong plan theo yêu cầu.)

## Security Considerations
- OPENAI_API_KEY chỉ server env (`process.env`) — KHÔNG `VITE_`, KHÔNG client bundle.
- Route dùng anon key + JWT user → RLS thi hành phân quyền; KHÔNG service role (không bypass RLS).
- Không log JWT/nội dung PII ra console production.
- Tools chỉ ĐỌC (rpc/select) — KHÔNG ghi order/bệnh sử (giữ "agent không thi hành").

## Next Steps
- UI chat (ngoài phạm vi backend) là bước kế tiếp — response đã streaming-ready (đổi `generateText`→`streamText`).
- Có thể thêm tool ghi-nháp (draft order) khi cần, vẫn qua duyệt người.
