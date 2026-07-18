# Phase 03 — Route /api/ops-report + prompt (phân tích Mức 1) + bảng ops_reports

## Overview
- **Priority:** cao (phần "AI" đúng nghĩa). Phụ thuộc: P01 (metrics + highlights), P02 (fallback snapshot — tùy chọn).
- **Status:** pending.
- KHÔNG số hóa giao ban. AI tạo **báo cáo vận hành on-demand** (tóm tắt + vấn đề nổi bật + phân tích Mức 1) cho lãnh đạo. Route tái dùng pattern `copilot.ts`/`compliance-judge.ts`.

## Key Insights
- Server route v1.168: `createFileRoute('/api/ops-report')({ server:{ handlers:{ POST }}})`. KHÔNG `createServerFileRoute`.
- **Phân tích Mức 1 (bám số)** = LLM chỉ dùng số + `highlights` trong snapshot để: xếp hạng vấn đề nổi bật, so sánh kỳ (Δ), nêu xu hướng, khoan vào thực thể sau con số (vd order quá hạn cũ nhất, vai nhiều vi phạm nhất). **CẤM: giải thích nguyên nhân (nhân quả), CẤM khuyến nghị hành động.** Lãnh đạo quyết.
- Nguồn kiểm chứng = card tất định (P04). Không tin client → server tự gọi `get_ops_metrics` (RLS admin theo JWT).
- `highlights` từ P01 là thứ nuôi phần "vấn đề nổi bật" một cách TẤT ĐỊNH (LLM không tự chọn thực thể → không bịa).

## Requirements
**Functional** — `POST /api/ops-report`:
1. Auth JWT (như copilot.ts). Guard admin (RPC raise → 403).
2. Parse `{ period_from?, period_to? }` (default hôm nay).
3. Gọi `get_ops_metrics(from,to)` → snapshot (gồm `highlights`). (Fallback P02: gọi `snapshot_ops_metrics()`.)
4. `generateText` gpt-4o-mini temp 0, `system=OPS_REPORT_PROMPT`, prompt = snapshot JSON. Cấu trúc báo cáo trả về (markdown/plain): **Tóm tắt** (2-3 câu số chính) · **Vấn đề nổi bật** (bullet, xếp theo mức từ highlights) · **Phân tích** (so sánh Δ / xu hướng, bám số).
5. INSERT `ops_reports(period_from, period_to, metrics=snapshot, report=text, created_by=uid)`; trả `{ id, report, metrics }`.
- Lịch sử: client query trực tiếp `ops_reports` (RLS admin) — KISS, không cần GET route.

**Non-functional**
- temp 0, fail-safe: LLM lỗi → trả `{ metrics, report:null }` (card vẫn hiện). File route <200 dòng → tách `prompt.ts`.

## Related Code Files
**Create**
- `supabase/migrations/20260718140200_ops_reports.sql` — bảng `ops_reports` + RLS admin (read/insert) + grants.
- `src/routes/api/ops-report.ts` — POST handler.
- `src/server/ops-report/prompt.ts` — `OPS_REPORT_PROMPT` (phân tích Mức 1; cấm nguyên nhân/khuyến nghị; chỉ dùng số + highlights trong JSON; cấu trúc 3 mục).

**Reuse:** `src/server/copilot/env.ts`, `@ai-sdk/openai`, `get_ops_metrics`.

## Implementation Steps
1. Migration `ops_reports` + RLS admin.
2. `prompt.ts` OPS_REPORT_PROMPT (3 mục, Mức 1).
3. Route: auth → get_ops_metrics → generateText → insert → trả. Fail-safe LLM.
4. `tsc` + build.

## Todo List
- [ ] Bảng ops_reports + RLS admin
- [ ] OPS_REPORT_PROMPT (Mức 1: tóm tắt + nổi bật + phân tích bám số; cấm nguyên nhân/khuyến nghị)
- [ ] Route POST (metrics → LLM → lưu) + fail-safe
- [ ] build sạch

## Success Criteria
- POST trả `report` tiếng Việt: mọi số truy được về `metrics`; phần "vấn đề nổi bật" khớp `highlights`.
- KHÔNG câu nào giải thích nguyên nhân ("vì…") hay khuyến nghị ("nên…").
- Lưu 1 dòng `ops_reports`. LLM lỗi → vẫn trả metrics. Non-admin → 403.

## Risk Assessment
- **LLM bịa số** → temp 0 + "chỉ dùng số trong JSON"; card là nguồn kiểm chứng.
- **LLM vượt Mức 1** (nguyên nhân/khuyến nghị) → prompt cấm rõ + tiêu chí test #4 loại; (tùy chọn) hậu-kiểm từ khóa "vì/nên/đề xuất".

## Security
- JWT→RLS; guard admin; không service role.

## Next Steps
- P04 gắn nút "Tạo báo cáo vận hành" + panel lịch sử báo cáo.
