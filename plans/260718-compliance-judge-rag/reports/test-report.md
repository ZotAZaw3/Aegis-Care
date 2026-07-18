# Test Report — Compliance Judge

**Ngày:** 2026-07-18 · Verify = `tsc --noEmit` + `npm run build` + unit thuần (không framework).

## Tự động (đã chạy, PASS)
- `npx tsc --noEmit` → No errors.
- `npm run build` → ✓ (`.output/` sinh, route `/api/compliance-judge` vào routeTree).
- `node scripts/test-citation-guard.mjs` → **6 pass / 0 fail** — kịch bản #3 "0 citation ma":
  - advisory citation ma (`c999`) → drop; advisory rỗng citation → drop; advisory nửa-thật-nửa-ma → chỉ giữ citation thật; MỌI citation còn lại map vào chunk thật.

## Code review (code-reviewer subagent)
- 8/10, **0 critical**. Citation guard xác nhận vững end-to-end; RLS/JWT đúng (không service role); migration 130000 mở rộng đúng, không phá backfill; Lớp A không tin client (lấy mandatory từ DB).
- Đã sửa **Warning #1**: `runDeterministic` giờ ném lỗi khi RPC lỗi → route trả 502, KHÔNG trả 'clean' giả (giữ bảo đảm "Lớp A luôn chạy").
- Đã dọn Nit #4 (dead-code filter thừa trong route).
- Còn (chấp nhận, ghi chú): ack_reasons chưa validate server-side (soft-block advisory, đúng thiết kế); `order-draft-panel.tsx` 227 dòng (hơi quá 200, để sau); `consent_missing` enum chưa phát (cắt scope 24h).

## Cần USER chạy (sau khi áp 2 migration qua Supabase SQL Editor)
> Migration P01 CHƯA áp → 3 kịch bản dưới chưa chạy được end-to-end.
1. **Kịch bản 1 — thiếu mandatory:** `/visits/:id`, chọn procedure có bước mandatory → bỏ tick 1 bước (không nhập lý do ở ExceptionDialog thì bị chặn sẵn; để test Judge, nhập lý do rỗng không được — thay vào đó test: giữ nguyên rồi kiểm modal khi có safety_flag). Kỳ vọng: modal Judge hiện, nút "Ký xác nhận" disabled tới khi nhập lý do cho finding high.
2. **Kịch bản 2 — cờ chống đông + nhổ:** chọn BN có systemic_flag chống đông + procedure extraction → modal hiện `safety_flag` (fact) + advisory trích dẫn SOP nếu corpus có, hoặc `insufficient`.
3. **Kịch bản 4 — auto-append:** UPDATE 1 visit có `diagnosis` → 'done' → `emr_conditions` clinic xuất hiện (origin_visit_id), briefing/DentalRecord thấy chẩn đoán mới.

## Kết luận
Code + unit + build: PASS. Phần DB/UI chờ user áp migration rồi chạy 3 kịch bản trên.
