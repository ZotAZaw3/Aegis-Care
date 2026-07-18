# Edge Function: `briefing` (Lane2 — bệnh sử LLM có trích dẫn)

Tóm tắt bệnh sử NHA của bệnh nhân bằng OpenAI `gpt-4o-mini`, **retrieval-only** (không chẩn đoán/khuyến nghị). Mỗi câu có `encounter_ids` + `verbatim_span`; câu không trích được nguồn / không nguyên văn / mang tính suy luận bị loại tại function.

## Phụ thuộc
- Migration `20260718070000_get_briefing_source.sql` (RPC lọc bệnh sử nha theo `dental_snomed_whitelist`). Apply trước.
- Data: 3 BN demo đã seed (Phase 02 seed-tay).

## Deploy (không có Supabase CLI → dùng Dashboard)
1. Supabase Dashboard → **Edge Functions** → **Deploy a new function** → tên `briefing`.
2. Dán toàn bộ `index.ts` vào editor → Deploy.
3. **Edge Functions → Manage secrets** → thêm `OPENAI_API_KEY = sk-...`.
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY` do Supabase tự cấp — không cần set.)

> Có CLI thì: `supabase functions deploy briefing` + `supabase secrets set OPENAI_API_KEY=sk-...`.

## Gọi thử (cần staff JWT — lấy từ session đăng nhập app, hoặc từ Dashboard → Auth)
```bash
curl -i -X POST "https://<project>.functions.supabase.co/briefing" \
  -H "Authorization: Bearer <STAFF_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"7fb1293d-2f94-f9c6-9bda-ba3b154fb103"}'   # ca ung thư miệng
```
Kỳ vọng: `summary_sentences[]` mỗi câu có `encounter_ids` thuộc BN + `verbatim_span`; `source_encounter_count` > 0.

## Ranh giới (pitch)
- Briefing = **Lane2 advisory**. Dị ứng/thuốc (Lane1) KHÔNG qua đây — đó là query cứng `get_safety_panel`.
- Citation-check = **chống bịa nguồn** (id tồn tại + trích nguyên văn), KHÔNG phải "chống suy diễn" tuyệt đối; thêm blocklist động từ suy luận để loại câu vượt rào.
- Đổi lại Anthropic: chỉ thay endpoint (`api.anthropic.com/v1/messages`) + model + header key. Prompt/validate giữ nguyên.

## Tuning
- Nếu briefing trả rỗng vì `verbatim_span` quá ngặt (LLM diễn giải thay vì trích), nới điều kiện verbatim (so khớp mềm) — nhưng giữ citation id.
