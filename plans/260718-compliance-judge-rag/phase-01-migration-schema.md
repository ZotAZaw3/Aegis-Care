# Phase 01 — Migration: auto-append condition + bảng audit

## Overview
- **Priority:** cao (nền cho Judge + hoàn tất auto-append graph). Độc lập P02–P04.
- **Status:** pending.
- Hai migration mới (immutable, áp tay qua Supabase SQL Editor).

## Key Insights
- `emit_encounter_on_visit_done` (mig 110000) đã tạo clinic encounter khi visit→'done'. Trigger cùng bảng `visit_sessions` fire theo thứ tự tên → để bảo đảm encounter tồn tại TRƯỚC khi nối condition, **KHÔNG tạo trigger riêng**; thay vào đó `CREATE OR REPLACE` chính hàm `emit_encounter_on_visit_done` để INSERT thêm `emr_conditions` NGAY SAU khi tạo encounter (cùng transaction, đúng thứ tự, DRY).
- `emr_conditions` đã có cột `source` (mig 110000) nhưng CHƯA có `origin_visit_id` → thêm để guard chống double-insert + truy nguồn.
- `visit_sessions.diagnosis` = text tự do → `emr_conditions.code = NULL`, `description = diagnosis`. Briefing bypass clinic (mig 110100) đã hiển thị dòng code NULL.

## Requirements
**Functional**
- `ALTER TABLE emr_conditions ADD COLUMN IF NOT EXISTS origin_visit_id uuid;` + index.
- `CREATE OR REPLACE FUNCTION emit_encounter_on_visit_done()`: sau khi INSERT encounter, nếu `NEW.diagnosis` không rỗng và chưa có condition origin_visit_id=NEW.id → INSERT `emr_conditions(patient_id, encounter_id=<clinic enc vừa tạo>, source='clinic', origin_visit_id=NEW.id, code=NULL, description=NEW.diagnosis, onset=COALESCE(NEW.closed_at,now())::date)`. Guard NOT EXISTS.
- Giữ nguyên phần backfill procedure/medication hiện có.
- Bảng `compliance_judgments`: `id uuid pk default gen_random_uuid()`, `visit_session_id uuid`, `patient_id uuid`, `procedure_type text`, `findings jsonb NOT NULL`, `verdict text`, `acked_by uuid` (staff), `ack_reasons jsonb`, `created_at timestamptz default now()`. Index `(patient_id)`, `(visit_session_id)`.

**Non-functional**
- RLS: `ENABLE ROW LEVEL SECURITY`; policy staff SELECT + INSERT (`is_staff(auth.uid())`); UPDATE staff (ghi ack sau). GRANT SELECT/INSERT/UPDATE authenticated, ALL service_role.
- Trigger fn giữ SECURITY DEFINER + `search_path` + REVOKE EXECUTE (đã có).

## Related Code Files
**Create**
- `supabase/migrations/20260718130000_clinic_condition_autoappend.sql` — ALTER emr_conditions + CREATE OR REPLACE emit_encounter_on_visit_done (thêm nhánh condition).
- `supabase/migrations/20260718130100_compliance_judgments.sql` — bảng audit + RLS + grants.

**Modify** — không sửa migration cũ (immutable).

## Implementation Steps
1. Viết mig 130000: ADD COLUMN origin_visit_id + index; CREATE OR REPLACE hàm (copy nguyên bản 110000 + chèn INSERT condition sau khi tạo encounter, trước backfill; guard NOT EXISTS origin_visit_id).
2. Viết mig 130100: bảng `compliance_judgments` + RLS + grants.
3. Áp cả 2 qua SQL Editor (chờ không có ETL chạy để tránh deadlock ALTER — hiện không có).
4. Test tay §Success.

## Todo List
- [ ] ALTER emr_conditions + index origin_visit_id
- [ ] CREATE OR REPLACE emit_encounter_on_visit_done (+nhánh condition, guard)
- [ ] Bảng compliance_judgments + RLS + grants
- [ ] Áp migration + test

## Success Criteria (đo được)
- UPDATE 1 visit có `diagnosis` → 'done' → `SELECT count(*) FROM emr_conditions WHERE origin_visit_id=<visit>` = 1; fire lại vẫn = 1 (guard).
- `get_briefing_source(<BN đó>)` trả condition mới (description = diagnosis).
- INSERT thử 1 dòng `compliance_judgments` bằng staff JWT thành công; anon bị chặn.

## Risk Assessment
- **Thứ tự trigger** → gộp vào 1 hàm (không tách trigger) đảm bảo encounter trước condition.
- **diagnosis rỗng** → guard `NULLIF(trim(diagnosis),'')` bỏ qua.
- **Double-insert** → guard NOT EXISTS origin_visit_id.

## Security
- emr_conditions clinic = PII → cùng RLS staff-read. compliance_judgments chứa findings (có thể lộ pattern) → staff-only.

## Next Steps
- P03 ghi vào `compliance_judgments`. P02/P03 đọc `get_safety_panel` (không đổi).
