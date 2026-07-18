# Brainstorm — Compliance Judge (RAG + deterministic) + auto-append graph

**Ngày:** 2026-07-18 · **Trạng thái:** ĐÃ CHỐT, chờ plan. · Scope: ~24h, bỏ imaging.

## 1. Vấn đề & mâu thuẫn cốt lõi
Executive Summary yêu cầu *Compliance Judge*: trước khi y lệnh xác nhận, AI đối chiếu y lệnh ↔ hồ sơ ↔ KB → cảnh báo bước thiếu / rủi ro / chưa tuân thủ, kèm căn cứ; người quyết. User thêm ràng buộc: **phải RAG** + **TUYỆT ĐỐI KHÔNG SAI**.

**Mâu thuẫn:** LLM-trên-RAG luôn có thể hallucinate → không thể vừa "để RAG phán" vừa "không sai". Giải: **tách 2 lớp, chỉ lớp tất định có quyền khẳng định.** Đúng ranh giới hệ thống: agent tư vấn — engine thi hành — người quyết.

**Định nghĩa "không sai" đã chốt:** *zero false assertion* (không bao giờ nói điều sai/vô căn cứ). CHẤP NHẬN có thể sót (recall < 100% là bản chất mọi hệ). Nguyên tắc: **thà sót còn hơn nói bậy.**

## 2. Kiến trúc chốt — Judge 2 lớp, chạy tại ranh giới ký y lệnh
`/visits/$id` OrderDraftPanel → bấm "Ký" → gọi `POST /api/compliance-judge` → modal findings → bác sĩ chỉnh HOẶC ack hard_findings + lý do → `insertSignedOrders`.

Request: `{ patient_id, procedure_type, decisions: DraftDecision[] }` (draft nào giữ/bỏ).

**Lớp A — Cổng tất định (thẩm quyền, không thể bịa):** thuần SQL/RPC dưới RLS user.
- `missing_mandatory`: `kb_rules` mandatory cho procedure_type mà decision không giữ & không bỏ-kèm-lý-do.
- `consent_missing`: rule `requires_consent` giữ nhưng thiếu order consent (lưu ý `insertSignedOrders` tự sinh consent con → chủ yếu info).
- `safety_flag`: `get_safety_panel` trả cờ bệnh nền / dị ứng nặng → **nêu sự thật** "BN có cờ X", KHÔNG phán cấm.

**Lớp B — Tư vấn RAG (kiến thức, phải người kiểm):** LLM trong route.
- Query truy hồi = nhãn vi procedure_type + các cờ an toàn Lớp A (vd "nhổ răng chống đông warfarin").
- `kb_search` RPC (hybrid RRF) → chunks.
- gpt-4o-mini, temp 0, prompt Judge (biến thể chặt của `system-prompt.ts`): mỗi "điểm cần đối chiếu" BẮT BUỘC kèm trích dẫn; chunk không nêu kết luận rõ → mục `insufficient` "cần đối chiếu thêm"; không trích dẫn → không hiện. Structured JSON output (zod schema).

**RĂNG CƯA chống-sai (mấu chốt, không chỉ prompt):** sau khi LLM trả, **server hậu-kiểm citation**: bỏ mọi advisory có citation KHÔNG map tới chunk thực sự nằm trong kết quả `kb_search` của lượt này. LLM bịa trích dẫn → bị drop tất định. Đây là "teeth" biến zero-false-assertion thành cưỡng chế được, không phải lời hứa.

**Output → modal UI (KHÔNG điểm):**
```
hard_findings[]  {type, severity, message, source:'engine'}   // đỏ, phải ack + lý do
advisories[]     {message, citations:[{doc, article, page, chunk_id}]}  // vàng, chip trích dẫn
insufficient[]   {topic, note}                                 // xám
verdict: 'clean' | 'has_findings'
```

**Xử hard_findings:** CHẶN MỀM — vẫn ký được nhưng buộc ack + lý do (ghi audit), giữ Human-first. (Consent vẫn giữ chặn cứng sẵn có ở gate.)

## 3. Auto-append Customer Graph (vá lỗ hổng condition)
Đã có: trigger `emit_encounter_on_visit_done` + `emit_emr_on_order_closed` (encounter + procedure + medication, source='clinic'). **Lỗ hổng:** chẩn đoán bác sĩ ở `visit_sessions.diagnosis` chưa đẩy vào `emr_conditions` → graph/briefing không thấy chẩn đoán mới.
→ **Trigger mới:** visit done / diagnosis set → INSERT `emr_conditions` (source='clinic', description=diagnosis, code NULL, encounter_id link, onset=date), guard NOT EXISTS. Briefing bypass clinic đã lo hiển thị. Imaging: bỏ qua (scope 24h).

## 4. Tái dùng (DRY) — không mọc infra mới
Route `/api/compliance-judge` dùng lại nguyên khối copilot: JWT→RLS client, `env.ts`, OpenAI, `kb_search`/`get_safety_panel` RPC, kỷ luật prompt. Chỉ khác: prompt Judge + hậu-kiểm citation + Lớp A SQL. KHÔNG Edge Function mới.

## 5. Audit (tùy chọn, mạnh cho demo)
Bảng `compliance_judgments` lưu mỗi lượt: patient, procedure, findings jsonb, verdict, acked_by, ack_reasons, at. Là bằng chứng "AI gác cổng" khi demo + audit trail. KISS: nếu cắt, nhét lý do ack vào `medical_orders.exception_reason` sẵn có.

## 6. Rủi ro & giảm nhẹ
| Rủi ro | Giảm nhẹ |
|---|---|
| Latency RAG+LLM ~2-4s lúc ký | Lớp A hiện ngay (tức thì); Lớp B load sau trong modal (spinner) |
| Corpus thiếu văn bản → advisory rỗng | Đúng hành vi "insufficient/thà sót"; không bịa |
| LLM bịa trích dẫn | Hậu-kiểm citation server-side drop (răng cưa §2) |
| Contraindication lâm sàng ("chống đông + nhổ") | KHÔNG hardcode kết luận (=inference); chỉ nêu cờ (fact) + để RAG trích SOP |
| Hiểu nhầm "không sót" | Nói rõ với giám khảo: zero false assertion, không phải 100% recall |

## 7. Tiêu chí thành công (đo được)
- Ký procedure thiếu bước mandatory → modal hiện `missing_mandatory`, buộc lý do mới ký được.
- BN có cờ chống đông + procedure nhổ → `safety_flag` + ≥1 advisory trích dẫn SOP chống đông (nếu corpus có), hoặc `insufficient` nếu không.
- Mọi advisory đều có citation map được vào chunk lượt đó (0 citation ma).
- Đóng ca có diagnosis → `emr_conditions` clinic xuất hiện → briefing thấy chẩn đoán mới.

## 8. Bước tiếp
→ `/ck:plan` cho: (P1) migration trigger condition + bảng audit; (P2) Lớp A RPC/SQL; (P3) route `/api/compliance-judge` + prompt + hậu-kiểm citation; (P4) UI modal tại điểm ký; (P5) test 4 kịch bản §7.
