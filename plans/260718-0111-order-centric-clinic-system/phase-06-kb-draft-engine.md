# Phase 06 — KB draft engine (rule engine) [24h-core]

## Context Links
- Brainstorm §3 (Compliance KB định hình nháp), §4.B (nháp y lệnh từ KB), §5 (KB là rule engine, KHÔNG LLM), §8 (KB là đường cắt cuối), §11 (xoá bước buộc → ghi exception).
- Bảng: `kb_rules` (Phase 01), trigger `route_order` (Phase 05).

## Overview
- **Priority:** P0 nhưng **đường cắt cuối** (nếu hết 24h, cắt phần này trước).
- **Status:** pending.
- **Mô tả:** Rule engine trên `kb_rules` theo `procedure_type`. Khi bác sĩ chọn thủ thuật, sinh **nháp y lệnh điền sẵn** các bước protocol (CBCT trước implant, kháng sinh dự phòng, consent gate, tái khám 7 ngày). Xóa bước `mandatory` → bắt buộc `exception_reason` + audit. KHÔNG bắn cảnh báo chủ động (né alert fatigue).

## Key Insights
- KB = **rule engine, KHÔNG LLM** (§5). "Không gọi trigger SQL là agent" (§6).
- Tuân thủ nằm trong MẶC ĐỊNH (nháp điền sẵn), không phải cảnh báo — đây là cách né alert fatigue (§8): chỉ cảnh báo khi xoá bước luật buộc.
- Kế thừa ý tưởng `checklist_rules` cũ (seed theo `procedure_type` + `assigned_role` + `required`) nhưng output là **draft orders**, không phải checklist items.
- Draft là NHÁP: bác sĩ đọc panel → tự quyết → ký. Bác sĩ có thể xóa bước; nếu bước `mandatory` → phải ghi lý do exception (audit ở `medical_orders.exception_reason`).
- `requires_consent=true` → sinh kèm gate consent con.

## Requirements
- FR1: seed `kb_rules` cho các procedure_type chính (implant, extraction, root_canal, scaling, filling + biopsy) với bước protocol thật.
- FR2: RPC/hàm client-side `get_order_drafts(p_procedure_type)` trả danh sách nháp order (chưa insert) để UI render.
- FR3: khi bác sĩ ký → insert các order được giữ; order từ bước `mandatory` bị xóa → chặn insert trừ khi có `exception_reason`.
- FR4: bước `requires_consent` → khi insert procedure order, kèm insert consent gate order con.
- NFR: KHÔNG cảnh báo chủ động. Logic draft thuần đọc kb_rules (deterministic).

## Architecture
```
Bác sĩ chọn procedure_type (Phase 07 workspace)
  → get_order_drafts(procedure_type) đọc kb_rules active, sort_order
  → UI render danh sách nháp (checkbox giữ/bỏ, sửa detail, due mặc định)
  → bác sĩ bỏ 1 bước mandatory → UI đòi exception_reason
  → "Ký & ban" → insert medical_orders (kb_rule_id, is_kb_mandatory, exception_reason nếu có)
       + với bước requires_consent → insert procedure order rồi insert consent gate con (parent_order_id)
  → trg route_order (Phase 05) tự set assigned_role/due_at
```

### Seed `kb_rules` — nội dung protocol (sketch)
| procedure_type | order_type | title | assigned_role | mandatory | requires_consent | due_offset | close_mode |
|---|---|---|---|---|---|---|---|
| implant | imaging | Chụp CBCT trước cấy | assistant | true | – | 24h | evidence |
| implant | consent | Cam kết cấy implant | receptionist | true | (gate) | – | evidence |
| implant | medication | Kháng sinh dự phòng | dentist | true | – | – | manual |
| implant | procedure | Cấy trụ implant | dentist | true | true | – | manual |
| implant | follow_up | Tái khám 7 ngày | receptionist | true | – | 7d | evidence |
| extraction | imaging | Chụp X-quang | assistant | true | – | – | evidence |
| extraction | consent | Cam kết nhổ răng | receptionist | true | (gate) | – | evidence |
| extraction | procedure | Nhổ răng | dentist | true | true | – | manual |
| extraction | follow_up | Tái khám 1 & 7 ngày | receptionist | true | – | 7d | evidence |
| root_canal | imaging | X-quang chóp | assistant | true | – | – | evidence |
| root_canal | consent | Cam kết nội nha | receptionist | true | (gate) | – | evidence |
| root_canal | procedure | Điều trị tủy | dentist | true | true | – | manual |
| scaling | procedure | Cạo vôi | dentist | true | false | – | manual |
| filling | procedure | Trám răng | dentist | true | false | – | manual |
| biopsy | consent | Cam kết sinh thiết | receptionist | true | (gate) | – | evidence |
| biopsy | procedure | Sinh thiết | dentist | true | true | – | manual |

(khám/cạo vôi/fluoride → KHÔNG consent, khớp §4.D.)

## Related Code Files
**Create:**
- Migration `20260718040000_seed_kb_rules.sql` — INSERT bảng trên (label_vi đầy đủ).
- Migration `20260718040100_get_order_drafts.sql` — RPC `get_order_drafts(procedure_type)` trả `jsonb` mảng nháp.
- (UI render + insert ở Phase 07.)

**Modify:** `src/integrations/supabase/types.ts` — regenerate.

**Read for context:** `checklist_rules` seed cũ (`20260717065437_*.sql`) làm mẫu nội dung; `kb_rules` schema; `route_order` (Phase 05).

## Implementation Steps
1. Viết seed `kb_rules` theo bảng trên; label_vi cho mọi dòng. `requires_consent=true` ở dòng procedure cần gate; dòng consent riêng có `order_type='consent'`.
2. RPC `get_order_drafts(p_procedure_type)`: SELECT kb_rules active WHERE procedure_type=p ORDER BY sort_order; trả jsonb (id, order_type, title/title_vi, detail, assigned_role, mandatory, requires_consent, due_offset_hours, close_mode). SECURITY DEFINER, staff-only.
3. Định nghĩa hợp đồng insert (cho Phase 07): mỗi nháp giữ lại → 1 row medical_orders với kb_rule_id + is_kb_mandatory=mandatory. Bước mandatory bị bỏ → client PHẢI gửi exception_reason (nếu không, không insert). Bước requires_consent → insert procedure order trước, lấy id, insert consent gate order con (order_type='consent', parent_order_id, procedure_type=parent).
4. Test: `get_order_drafts('implant')` trả 5 nháp; `get_order_drafts('scaling')` không có consent.
5. Regenerate types.

## Todo List
- [ ] Seed `kb_rules` (implant/extraction/root_canal/scaling/filling/biopsy) + label_vi
- [ ] RPC `get_order_drafts(procedure_type)`
- [ ] Ghi rõ hợp đồng insert (mandatory→exception, requires_consent→gate con) cho Phase 07
- [ ] Test drafts implant vs scaling
- [ ] Regenerate types.ts

## Success Criteria
- `get_order_drafts('implant')` trả đúng 5 bước gồm CBCT + consent + kháng sinh + procedure + follow-up 7d.
- `get_order_drafts('scaling')` KHÔNG có consent gate.
- Bỏ bước mandatory mà không có exception_reason → không insert được (enforced Phase 07 UI + note để Phase 05 trigger có thể CHECK).
- KHÔNG cảnh báo nào bắn khi mở draft (chỉ điền sẵn).

## Risk Assessment
- **KB là đường cắt cuối** → nếu hết giờ, workspace Phase 07 vẫn cho bác sĩ tự viết order thủ công (không draft). KB chỉ tăng tiện.
- **Nội dung protocol sai chuyên môn** → seed theo bảng đã chốt, ghi rõ đây là mẫu demo, cần chuyên gia nha review sau (brainstorm §8 rủi ro).

## Security Considerations
- `kb_rules` admin-gated write (chính sách). `get_order_drafts` staff read-only.
- Exception khi xóa bước buộc → audit qua `medical_orders.exception_reason` + `ordered_by` (không cho bỏ im lặng).

## Next Steps
- Phase 07 render draft + insert khi ký.
