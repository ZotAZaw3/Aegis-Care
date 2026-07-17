# Phase 03 — Customer Graph read layer (Lane1 + Lane3 + SNOMED whitelist) [24h-core]

## ⚠ RED-TEAM FIXES — BẮT BUỘC (xem reports/red-team-260718.md)
- **B2 (CRITICAL) — Lane1 sót thuốc chết người:** KHÔNG seed keyword = tên nhóm ("DOAC", "bisphosphonate") — `emr_medications.description` là hoạt chất RxNorm ("Apixaban 5 MG…", "Alendronic acid…") nên `%DOAC%` khớp 0 → bỏ lọt chống đông + bisphosphonate. Phải **liệt kê tường minh mọi hoạt chất + biệt dược** mỗi nhóm (anticoagulant: warfarin, apixaban/Eliquis, rivaroxaban/Xarelto, dabigatran, edoxaban, enoxaparin, clopidogrel, ticagrelor…; antiresorptive: alendronate/Fosamax, risedronate, ibandronate, zoledronic acid/Zometa/Reclast, pamidronate, + denosumab/Prolia). Ưu tiên match `medication_rxnorm` (ingredient code), keyword là lớp phụ. Seed **hàng chục dòng**, không 6-8.
- **Success Criteria bổ sung:** test-case BN dùng **apixaban** PHẢI ra flag "chống đông" + **alendronate** ra "MRONJ" (không chỉ warfarin — nếu không lỗi lọt nghiệm thu).
- **Thu gọn cho 24h:** whitelist SNOMED có thể rút còn ~30 mã của ca demo thay vì 100-150 (red-team C5).

## Context Links
- Brainstorm §5 (AI ở đâu / không ở đâu), §7.1 (mô hình 3-lane), §4.B (panel bối cảnh).
- Bảng nguồn: `emr_*` (Phase 02), `nka_systemic_flags` + `dental_snomed_whitelist` (Phase 01).
- Module JSON để trích whitelist: `E:/Documents/VAIC 2026/synthea/modules/` (6 file).

## Overview
- **Priority:** P0 — Lane1 là đường an toàn bệnh nhân (query cứng, không LLM).
- **Status:** pending.
- **Mô tả:** Dựng lớp ĐỌC deterministic cho Customer Graph: **Lane1** panel an toàn (dị ứng + thuốc + bệnh nền liên quan, TOÀN THÂN, hard-query), **Lane3** CRM/recall (thuần nha, deterministic). Trích bộ SNOMED nha từ 6 module → seed `dental_snomed_whitelist` cho Lane2 (Phase 04 dùng).

## Key Insights
- **Lane1 KHÔNG qua LLM** (§5): dị ứng/thuốc/bệnh nền là query cứng, luôn hiện, bất biến giao diện. LLM sót thì không có trích dẫn để kiểm (automation bias) → thứ giết người không đi qua thứ có thể quên.
- Lane1 = TOÀN THÂN, KHÔNG lọc nha: warfarin ghi ở khám tim mạch nhưng gây chảy máu khi nhổ răng.
- Bệnh nền liên quan nha (~6-8): chống đông, bisphosphonate (MRONJ), tiểu đường, thai kỳ, rối loạn đông máu, suy giảm miễn dịch. **KB định nghĩa danh sách** (`nka_systemic_flags`), **Graph truy xuất** BN có trong danh sách không. Hệ thống đẩy SỰ THẬT lên panel, KHÔNG phán "cân nhắc bắc cầu" (đó là inference = cấm).
- Lane2 whitelist trích từ module có **caveat** (§7.1): module chứa cả mã bệnh nền tham chiếu (vd `44054006 Diabetes` trong periodontal). Phải tách: mã ở state Procedure/Condition nha → whitelist Lane2; mã bệnh nền → gợi ý Lane1 (bonus, danh sách cuối do lâm sàng chốt).

## Requirements
- FR1: RPC `get_safety_panel(p_patient_id)` — trả allergies + active medications + systemic flags khớp `nka_systemic_flags`. Deterministic, KHÔNG LLM. `SECURITY DEFINER`, staff-only.
- FR2: RPC `get_crm_recall(p_patient_id)` — Lane3: lần khám nha gần nhất, recall/follow_up order đang treo, procedure nha đã làm (lọc `dental_snomed_whitelist`).
- FR3: Script trích SNOMED nha từ 6 module JSON → seed `dental_snomed_whitelist` (~100-150 mã distinct + mã khám/fluoride cơ bản), TÁCH mã bệnh nền tham chiếu.
- NFR: RPC trả JSON gọn cho UI; index sẵn trên `emr_*(patient_id)`.

## Architecture
```
Lane1 get_safety_panel(patient_id) →
  { allergies:[{allergen,severity}],
    medications:[{name, active}],
    systemic_flags:[{label_vi, matched_by}] }   -- join emr_conditions/emr_medications ∩ nka_systemic_flags
Lane3 get_crm_recall(patient_id) →
  { last_dental_encounter, open_followups:[...], dental_procedures:[...] }  -- lọc dental_snomed_whitelist
Lane2 (Phase 04): edge function dùng dental_snomed_whitelist lọc encounter trước khi đưa LLM.
```
Trích whitelist: script `scripts/extract-dental-snomed.ts` đọc 6 JSON, gom code ở state `type='Procedure'|'ConditionOnset'` (kind theo state), loại code trùng, **đánh dấu** code cũng xuất hiện dạng bệnh nền tham chiếu (state condition phi-nha) → không đưa vào whitelist Lane2, thay vào đó xuất danh sách gợi ý cho `nka_systemic_flags` (review tay).

## Related Code Files
**Create:**
- Migration `20260718020000_customer_graph_rpcs.sql` — `get_safety_panel`, `get_crm_recall` (SECURITY DEFINER, GRANT EXECUTE authenticated, revoke anon).
- `scripts/extract-dental-snomed.ts` — trích + sinh SQL/seed `dental_snomed_whitelist`.
- Migration `20260718020100_seed_dental_snomed_whitelist.sql` — INSERT whitelist (output từ script).

**Modify:** `src/integrations/supabase/types.ts` — regenerate (RPC types).

**Read for context:** 6 module JSON, `emr_*` schema (Phase 01), `nka_systemic_flags` seed.

## Implementation Steps
1. `extract-dental-snomed.ts`: đọc 6 JSON, duyệt `states`, gom `code`/`codes` ở state Procedure & ConditionOnset. Ghi `{code,label,source_module,kind}`.
2. Tách caveat: nếu 1 code xuất hiện ở module như bệnh nền tham chiếu (vd Diabetes trong periodontal như điều kiện rẽ nhánh, không phải chẩn đoán nha) → loại khỏi whitelist Lane2, thêm vào file `systemic-suggestions.md` để review.
3. Thêm mã khám/sâu răng/fluoride cơ bản (Synthea gốc) vào whitelist.
4. Sinh migration seed từ output (~100-150 dòng INSERT).
5. Viết `get_safety_panel`: JOIN `patient_allergies` + `emr_medications` (active = stop IS NULL) + `emr_conditions`/`emr_medications` ∩ `nka_systemic_flags` (match theo `match_kind`). Trả `jsonb`.
6. Viết `get_crm_recall`: last dental encounter = max(start) trên `emr_encounters` có code ∈ whitelist HOẶC organization nha; open follow_up orders từ `medical_orders` (order_type='follow_up', status open); dental procedures ∩ whitelist.
7. GRANT EXECUTE cho authenticated; test bằng patient_id đã seed (Phase 02).
8. Regenerate types.

## Todo List
- [ ] `extract-dental-snomed.ts` trích 6 module
- [ ] Tách mã bệnh nền tham chiếu (caveat) → `systemic-suggestions.md`
- [ ] Thêm mã khám/fluoride cơ bản
- [ ] Migration seed `dental_snomed_whitelist`
- [ ] RPC `get_safety_panel` (Lane1, hard-query)
- [ ] RPC `get_crm_recall` (Lane3)
- [ ] GRANT + test trên BN đã seed
- [ ] Regenerate types.ts

## Success Criteria
- `SELECT get_safety_panel('<patient có warfarin>')` trả medication warfarin + systemic_flag "chống đông" — KHÔNG qua LLM.
- `dental_snomed_whitelist` có ~100-150 mã, KHÔNG chứa `44054006` (Diabetes) như mã nha.
- `get_crm_recall` trả procedure nha đúng, không lẫn encounter phi-nha.
- RPC chạy được từ client authenticated, chặn anon.

## Risk Assessment
- **Whitelist sót/dư mã** → review tay `systemic-suggestions.md`; whitelist rộng hơn chút an toàn hơn cho briefing (chỉ ảnh hưởng độ gọn, không ảnh hưởng an toàn).
- **Lane1 sót thuoc active** → định nghĩa active rõ (stop IS NULL OR stop > now()); ưu tiên hiện thừa hơn sót.
- **RPC lộ dữ liệu chéo BN** → tham số hóa theo p_patient_id, SECURITY DEFINER + is_staff check trong hàm.

## Security Considerations
- Lane1 là đường an toàn bệnh nhân → tuyệt đối deterministic, không nhánh LLM.
- RPC SECURITY DEFINER phải `SET search_path=public` + kiểm `is_staff(auth.uid())` đầu hàm.
- Danh sách `nka_systemic_flags`/whitelist là chính sách → admin-gated write.

## Next Steps
- Phase 04 briefing dùng `dental_snomed_whitelist` lọc encounter.
- Phase 07 UI panel bối cảnh gọi `get_safety_panel` + `get_crm_recall`.
