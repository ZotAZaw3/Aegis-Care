---
type: handoff
task: Aegis Care — đưa backend đáp ứng Executive Summary (Compliance Judge shipped, AI Ops Report planned)
status: in-progress
date: 2026-07-18 21:00
next: Cook plan AI Ops Report (plans/260718-ai-meeting-copilot/) HOẶC test Compliance Judge P05 trên prod trước
---

## Goal
Aegis Care = hệ vận hành phòng khám nha (VAIC 2026, VN, AI mandatory). Mục tiêu phiên: đối chiếu backend với Executive Summary rồi lấp gap. Bất biến toàn hệ: **agent tư vấn — engine thi hành — người quyết · retrieval-not-inference · deterministic-first · KHÔNG compliance_score.**

## State
- **Done — đã ship + push + verify:**
  - Fix copilot "không biết mọi hồ sơ": thêm tool `find_patient` (tên→id) + auto-set patient context ở `patients.$id`. Commit `f7d4639`.
  - Data thật đã đúng: prod trỏ Supabase `rwvfpjtxcmubjqelsncq` (đúng project, 801 BN Synthea Việt hóa, 700k procedures). "Mock" chỉ là hiểu nhầm tên Synthea. 3 tài khoản staff: tiendungtran2005@ (admin), abc@ (dentist), dungbop28092005@ (receptionist).
  - Patients: phân trang (24/trang) + trang chi tiết thêm SafetyPanel + DentalRecord. Commit trong `f7d4639`/`6c77918`.
  - **Compliance Judge (gap #1) — HOÀN TẤT code + migration ÁP + push `6c77918`.** 2 lớp tại điểm ký y lệnh, citation-guard cưỡng chế zero-false-assertion (unit 6/6), audit `compliance_judgments`. Auto-append `visit.diagnosis`→`emr_conditions`. tsc/build sạch, code-review 8/10 (đã sửa Warning#1). CLAUDE.md tạo (commit `d8818ad`).
- **Remaining:**
  - Compliance Judge **P05**: 3 kịch bản UI/DB chờ test trên prod (missing_mandatory buộc lý do; cờ chống đông + nhổ → advisory/insufficient; diagnosis→emr_conditions→briefing). Migration ĐÃ áp, đã verify object tồn tại.
  - **AI Ops Report** (gap #7): plan XONG, chưa cook. `plans/260718-ai-meeting-copilot/` (active plan). 5 phase.

## Key decisions
- Compliance Judge phải RAG + "không được sai" → giải bằng **2 lớp**: Lớp A tất định (thẩm quyền) + Lớp B RAG chỉ advisory; **server hậu-kiểm citation** drop trích dẫn ma. "Không sai" = zero false assertion (KHÔNG phải 100% recall) — thà sót còn hơn nói bậy.
- hard_findings = **chặn mềm** (ack+lý do), giữ human-first.
- AI Ops Report: **KHÔNG số hóa giao ban** (7h offline giữ nguyên) — AI tạo báo cáo on-demand. **Phân tích Mức 1 (bám số)**: xếp hạng/so sánh/xu hướng + khoan thực thể; CẤM giải thích nguyên nhân + CẤM khuyến nghị. LLM KHÔNG tính số (SQL tất định tính; LLM chỉ diễn giải). "vấn đề nổi bật" nuôi bằng `highlights` tất định.
- "Khoa/phòng ban" DB không có → nhóm theo `assigned_role`. "Tỷ lệ tuân thủ" → đếm + Δ, KHÔNG %.
- Compliance rate philosophy giữ nguyên: đếm vi phạm treo, không chấm điểm.

## Active files
- `plans/260718-ai-meeting-copilot/` — plan AI Ops Report (đã reframe v2), active plan, tasks #22-26. plan.md + 5 phase + brainstorm-report.md.
- `plans/260718-compliance-judge-rag/` — plan Judge (P01-04 done, P05 treo), reports/test-report.md.
- `src/server/judge/*` + `src/routes/api/compliance-judge.ts` + `src/components/dentist/compliance-judge-dialog.tsx` + `order-draft-panel.tsx` — Judge đã ship.
- `src/server/copilot/{env,tools,system-prompt}.ts` — stack tái dùng cho mọi route AI (JWT→RLS pattern).
- `supabase/migrations/20260718130000/130100` — Judge migrations (đã áp).

## Next steps
1. Chọn: `/cook plans/260718-ai-meeting-copilot/` (build Ops Report) HOẶC test Judge P05 trên prod.
2. Nếu cook Ops Report: P01 metrics RPC (get_ops_metrics+highlights, get_ops_trends) → P02 ops_metrics_daily+pg_cron → P03 /api/ops-report (prompt Mức 1, bảng ops_reports) → P04 dashboard UI (recharts, admin-gated) → P05 test. Migration áp tay qua SQL Editor.
3. Ops Report migration mới sẽ là `20260718140000+` (ops_metrics_rpc, ops_metrics_daily, ops_reports).

## Open threads / blockers
- Judge P05 chưa xác nhận end-to-end trên prod (cần user thao tác UI).
- pg_cron chưa chắc bật được trên Supabase project → P02 có fallback snapshot-on-report.
- recharts SSR trong TanStack Start có thể cần guard client-side (ghi ở phase-04 risk).
- Backend còn thiếu (validate): kết quả xét nghiệm/labs (ETL bỏ observations.csv, không có emr_observations); quy định pháp lý mới ở dạng RAG chưa thành executable rule.

## Resume context
- branch `main` (đã push tới `6c77918`+`d8818ad`; local == origin).
- Verify: `npx tsc --noEmit` + `npm run build` (không có test runner). Unit: `node scripts/test-citation-guard.mjs`.
- Supabase project `rwvfpjtxcmubjqelsncq`; secrets ở `.dev.vars` (OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY); `.env` chỉ public VITE_ keys. Migration áp tay qua SQL Editor (immutable).
- Dev: `npm run dev` (port 8080). Đăng nhập prod bằng 1 trong 3 email staff ở trên.
