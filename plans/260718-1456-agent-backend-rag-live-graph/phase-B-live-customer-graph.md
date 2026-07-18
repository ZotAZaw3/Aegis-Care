# Phase B — Customer Graph SỐNG (source + triggers)

## Context Links
- Brainstorm §6.2 (authoritative)
- Convention trigger (bắt buộc theo): `supabase/migrations/20260718030000_order_lifecycle_triggers.sql` (SECURITY DEFINER + `SET search_path` + REVOKE EXECUTE + guard `OLD.status <> NEW.status`)
- Schema đích: `emr_reference_tables.sql`; `medical_orders`/`visit_sessions` trong `20260718020100_order_centric_core.sql` + `20260717100100_replace_appointments_with_visit_queue.sql`
- Briefing source: `20260718070000_get_briefing_source.sql`
- Lane1 (tự hưởng lợi clinic meds): `20260718060000_customer_graph_rpcs.sql`

## Overview
- **Priority:** cao. Độc lập A/C.
- **Status:** pending.
- `emr_*` = bệnh sử canonical với 2 nguồn qua cột `source` ('synthea'|'clinic'). Trigger đẩy dữ liệu vận hành (visit done, order đóng) thành encounter/procedure/medication nguồn 'clinic'. BN mới KHÔNG cần ETL vẫn có graph. Briefing bypass whitelist cho clinic (mặc nhiên nha khoa).

## Key Insights
- `visit_status` enum có `'done'` (bảng có sẵn). `visit_sessions` có `chief_complaint`, `created_at`, `closed_at`, `patient_id`.
- `medical_orders`: `order_type` ∈ (imaging,lab,procedure,medication,follow_up,referral,consent); có `closed_at`, `closed_by`, `title`, `procedure_type`, `patient_id`, `visit_session_id`. Order lifecycle đã set `status='closed'` + `closed_at=now()` ở `auto_close_on_evidence`.
- Cần cột LINK để chống double-insert + truy nguồn: thêm `origin_visit_id`/`origin_order_id` vào emr_* (nullable). Guard = `NOT EXISTS ... WHERE origin_visit_id = NEW.id`.
- Lane1 `get_safety_panel` đọc `emr_medications` theo `med_stop` → clinic medication (source='clinic') TỰ ĐỘNG hiển thị, không cần sửa Lane1. (Chỉ cần đảm bảo trigger set `med_stop` hợp lý — NULL = đang dùng.)
- get_briefing_source hiện lọc bằng `dental_snomed_whitelist` theo `code`. Clinic rows có `code` NULL → sẽ bị loại → phải bypass cho `source='clinic'`.

## Requirements
**Functional**
- Cột `source text NOT NULL DEFAULT 'synthea'` + CHECK `IN ('synthea','clinic')` trên `emr_encounters`, `emr_procedures`, `emr_medications` (tối thiểu; thêm `emr_conditions` tùy chọn nếu sau này order chẩn đoán).
- Trigger A: `visit_sessions` status→'done' (từ ≠'done') ⇒ INSERT `emr_encounters` (source='clinic', patient_id, description=`chief_complaint`, encounter_start=`created_at`, encounter_stop=`closed_at`, class='ambulatory', origin_visit_id=NEW.id). Guard NOT EXISTS.
- Trigger B: `medical_orders` status→'closed' (từ ≠'closed'):
  - `order_type='procedure'` ⇒ INSERT `emr_procedures` (source='clinic', description=`title`, performed_at=`closed_at`, code=map(procedure_type) hoặc NULL, patient_id, encounter_id=link tới clinic encounter của visit nếu có, origin_order_id=NEW.id).
  - `order_type='medication'` ⇒ INSERT `emr_medications` (source='clinic', description=`title`, med_start=`closed_at`::date, med_stop=NULL, code NULL, origin_order_id).
  - Guard NOT EXISTS theo origin_order_id.
- `get_briefing_source`: bypass whitelist khi `source='clinic'` (encounter clinic luôn coi là nha khoa; nested conditions/procedures clinic cũng vào).

**Non-functional**
- Theo đúng convention: SECURITY DEFINER, `SET search_path=public`, REVOKE EXECUTE khỏi PUBLIC/anon/authenticated cho trigger fn.
- Additive, không phá dữ liệu synthea hiện có (DEFAULT 'synthea').

## Architecture (SQL sketch)
```sql
-- migration 20260718110000_live_graph_source_and_triggers.sql
ALTER TABLE public.emr_encounters  ADD COLUMN source text NOT NULL DEFAULT 'synthea'
  CHECK (source IN ('synthea','clinic')), ADD COLUMN origin_visit_id uuid;
ALTER TABLE public.emr_procedures  ADD COLUMN source text NOT NULL DEFAULT 'synthea'
  CHECK (source IN ('synthea','clinic')), ADD COLUMN origin_order_id uuid;
ALTER TABLE public.emr_medications ADD COLUMN source text NOT NULL DEFAULT 'synthea'
  CHECK (source IN ('synthea','clinic')), ADD COLUMN origin_order_id uuid;
CREATE INDEX idx_emr_enc_origin_visit ON public.emr_encounters (origin_visit_id);
CREATE INDEX idx_emr_proc_origin_order ON public.emr_procedures (origin_order_id);
CREATE INDEX idx_emr_med_origin_order  ON public.emr_medications (origin_order_id);

-- Trigger A: visit done -> clinic encounter
CREATE OR REPLACE FUNCTION public.emit_encounter_on_visit_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done'
     AND NOT EXISTS (SELECT 1 FROM public.emr_encounters e WHERE e.origin_visit_id = NEW.id) THEN
    INSERT INTO public.emr_encounters
      (patient_id, source, origin_visit_id, class, description, encounter_start, encounter_stop)
    VALUES (NEW.patient_id, 'clinic', NEW.id, 'ambulatory',
            COALESCE(NEW.chief_complaint, 'Khám nha khoa'), NEW.created_at, COALESCE(NEW.closed_at, now()));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_encounter AFTER UPDATE ON public.visit_sessions
  FOR EACH ROW EXECUTE FUNCTION public.emit_encounter_on_visit_done();

-- Trigger B: order closed -> clinic procedure/medication
CREATE OR REPLACE FUNCTION public.emit_emr_on_order_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enc uuid;
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    SELECT id INTO v_enc FROM public.emr_encounters
      WHERE origin_visit_id = NEW.visit_session_id LIMIT 1;   -- link nếu visit đã 'done'
    IF NEW.order_type = 'procedure'
       AND NOT EXISTS (SELECT 1 FROM public.emr_procedures p WHERE p.origin_order_id = NEW.id) THEN
      INSERT INTO public.emr_procedures
        (patient_id, encounter_id, source, origin_order_id, description, performed_at)
      VALUES (NEW.patient_id, v_enc, 'clinic', NEW.id, NEW.title, NEW.closed_at);
    ELSIF NEW.order_type = 'medication'
       AND NOT EXISTS (SELECT 1 FROM public.emr_medications m WHERE m.origin_order_id = NEW.id) THEN
      INSERT INTO public.emr_medications
        (patient_id, encounter_id, source, origin_order_id, description, med_start, med_stop)
      VALUES (NEW.patient_id, v_enc, 'clinic', NEW.id, NEW.title, NEW.closed_at::date, NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_emr_order AFTER UPDATE ON public.medical_orders
  FOR EACH ROW EXECUTE FUNCTION public.emit_emr_on_order_closed();

REVOKE EXECUTE ON FUNCTION public.emit_encounter_on_visit_done() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_emr_on_order_closed()     FROM PUBLIC, anon, authenticated;
```
get_briefing_source patch (thêm nhánh clinic):
```sql
-- dental_enc: ... OR e.source = 'clinic'
-- nested conditions/procedures: ... OR c.source = 'clinic' / pr.source = 'clinic'
```

## Related Code Files
**Create**
- `supabase/migrations/20260718110000_live_graph_source_and_triggers.sql` — cột source + 2 trigger + grants.
- `supabase/migrations/20260718110100_get_briefing_source_clinic_bypass.sql` — `CREATE OR REPLACE` get_briefing_source có nhánh clinic.

**Modify** — không sửa migration cũ (immutable); thay bằng migration mới `CREATE OR REPLACE`.

**Delete** — không.

## Implementation Steps
1. Viết migration cột `source` + `origin_*` + index.
2. Viết `emit_encounter_on_visit_done` + trigger AFTER UPDATE visit_sessions.
3. Viết `emit_emr_on_order_closed` + trigger AFTER UPDATE medical_orders (procedure/medication).
4. REVOKE EXECUTE 2 fn.
5. Migration mới `CREATE OR REPLACE get_briefing_source` thêm nhánh `source='clinic'` ở encounter + nested.
6. Áp cả 2 migration qua Supabase SQL Editor.
7. Test tay: UPDATE 1 visit → 'done' → kiểm `emr_encounters` có dòng clinic; UPDATE lại → 'done' lần nữa (nếu có) không nhân đôi (guard).
8. Test: đóng 1 medical_order procedure → `emr_procedures` clinic; medication → `emr_medications` clinic (med_stop NULL).
9. Test: `get_safety_panel` với BN có medication clinic → thuốc hiện trong `medications`.
10. Test: `get_briefing_source` với BN chỉ có encounter clinic (code NULL) → vẫn trả encounter (bypass whitelist).

## Todo List
- [ ] Migration cột source + origin_* + index
- [ ] Trigger A visit→encounter (guard NOT EXISTS)
- [ ] Trigger B order→procedure/medication (guard)
- [ ] REVOKE EXECUTE trigger fns
- [ ] get_briefing_source clinic bypass
- [ ] Áp migration + test 4 kịch bản
- [ ] Verify không double-insert khi re-fire

## Success Criteria (đo được)
- `\d emr_encounters` có cột `source` default 'synthea'; dữ liệu synthea cũ vẫn `source='synthea'` (đếm không đổi).
- Sau UPDATE visit→'done': `SELECT count(*) FROM emr_encounters WHERE origin_visit_id=<visit>` = 1; fire lại = vẫn 1.
- Sau đóng procedure order: `emr_procedures` có 1 dòng `source='clinic', description=<title>, performed_at=closed_at`.
- Sau đóng medication order: `emr_medications` clinic, `med_stop IS NULL` → xuất hiện trong `get_safety_panel().medications`.
- `get_briefing_source(<BN clinic-only>)` trả ≥1 encounter dù code NULL.

## Risk Assessment
- **Double-insert khi trigger re-fire / nhiều UPDATE** → guard `OLD.status IS DISTINCT FROM NEW.status` + `NOT EXISTS origin_*`.
- **visit chưa 'done' khi order đóng** → encounter link NULL (chấp nhận; procedure vẫn ghi patient_id). Không chặn.
- **procedure_type→code map** không có bảng map rẻ → để `code=NULL` (KISS); Lane3 lọc theo whitelist sẽ bỏ qua clinic-proc code NULL — chấp nhận (clinic proc vẫn hiện qua briefing bypass). Ghi rõ giới hạn.
- **Trigger nặng** → chỉ 1 INSERT/lần, không loop; index origin_* cho guard nhanh.

## Security Considerations
- Trigger fn SECURITY DEFINER + REVOKE EXECUTE (không client gọi trực tiếp) — đúng convention Phase 05.
- Không mở RLS mới; emr_* vẫn staff-read. Clinic rows cũng là PII → cùng policy.
- Bypass whitelist chỉ nới phạm vi briefing (Lane2, retrieval-only, đã lọc câu suy luận ở edge fn) — không ảnh hưởng Lane1.

## Next Steps
- Cùng A cung cấp graph phong phú cho tool `patient_history` (Phase D).
- Không chặn A/C.
