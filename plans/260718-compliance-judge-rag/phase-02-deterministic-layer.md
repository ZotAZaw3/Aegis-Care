# Phase 02 — Lớp A tất định (server helper)

## Overview
- **Priority:** cao (phần "có thẩm quyền" + "không sai"). Phụ thuộc: không (đọc RPC/bảng sẵn có).
- **Status:** pending.
- Module server thuần TS, tính `hard_findings` từ dữ kiện tất định. KHÔNG LLM. Tái lập 100%.

## Key Insights
- `get_order_drafts(procedure_type)` trả mảng `OrderDraft` có `id, mandatory, requires_consent, order_type, title_vi`. Đây là "nên có gì". Request từ UI gửi `decisions[]` (`{rule_id, keep, reason}`) = "bác sĩ giữ/bỏ gì".
- **KHÔNG tin client**: helper tự query lại `kb_rules`/`get_order_drafts` bằng RLS client của route để lấy danh sách mandatory chuẩn, rồi so với `decisions` từ request (chỉ dùng client cho keep/reason). → chống tamper, đúng "thẩm quyền".
- `get_safety_panel(patient_id)` trả `{allergies, medications, systemic_flags}`. `safety_flag` finding = liệt kê fact (BN có cờ X), severity = `severity_hint`/allergy severity. KHÔNG map sang kết luận lâm sàng (đó là inference — cấm).

## Requirements
**Functional** — hàm `runDeterministic(supabase, { patientId, procedureType, decisions })` → `HardFinding[]`:
- `missing_mandatory`: với mỗi rule `mandatory=true` từ `get_order_drafts(procedureType)`: nếu decision tương ứng `keep=false` mà `reason` rỗng → finding (severity 'high'). (keep=false có reason = ngoại lệ hợp lệ đã ghi → KHÔNG finding, nhưng đính kèm 'exception_logged' info.)
- `consent_missing`: có rule `requires_consent=true` được giữ → info nhắc consent gate sẽ sinh (thực thi vẫn ở `insertSignedOrders`); nếu logic tương lai cho tắt → finding. (24h: mức info.)
- `safety_flag`: mỗi `systemic_flags[]` → finding (severity theo `severity_hint`); dị ứng severe → finding. Message = nhãn vi (label_vi) + "— dữ kiện đã ghi, đối chiếu panel an toàn."
- Trả kèm `verdictHard = hard_findings.some(f => f.severity==='high')`.

**Non-functional**
- Thuần TS, không LLM, không phụ thuộc mạng ngoài Supabase. Deterministic (test lặp lại giống nhau).
- File <200 dòng.

## Related Code Files
**Create**
- `src/server/judge/deterministic.ts` — `runDeterministic()` + type `HardFinding`.
- (types dùng chung) `src/server/judge/types.ts` — `HardFinding`, `Advisory`, `Insufficient`, `JudgeResult`.

## Implementation Steps
1. Định nghĩa types (types.ts).
2. `runDeterministic`: gọi `get_order_drafts` + `get_safety_panel` song song; so mandatory vs decisions; sinh findings; trả mảng.
3. Đảm bảo message tiếng Việt trung tính (fact-only), có field `type` để UI i18n.

## Todo List
- [ ] types.ts (HardFinding/Advisory/Insufficient/JudgeResult)
- [ ] deterministic.ts: missing_mandatory + consent + safety_flag
- [ ] Chỉ nêu fact, không kết luận lâm sàng

## Success Criteria
- Bỏ 1 bước mandatory KHÔNG lý do → có đúng 1 `missing_mandatory`.
- Bỏ mandatory CÓ lý do → 0 `missing_mandatory`.
- BN có systemic_flag chống đông → có `safety_flag` message nêu fact, không chứa từ "nên/cấm/không được".

## Risk Assessment
- **Client giả decisions** → helper lấy mandatory từ DB, chỉ tin keep/reason. Rule không tồn tại trong DB bị bỏ qua.
- **safety_flag suy diễn** → chỉ format label, cấm thêm khuyến nghị.

## Security
- Chạy dưới RLS client của route (JWT user) → chỉ thấy dữ liệu staff được phép.

## Next Steps
- P03 gọi `runDeterministic` rồi ghép Lớp B.
