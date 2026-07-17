# Phase 01 — Schema order-centric (ADDITIVE) [24h-core]

## ⚠ RED-TEAM FIXES — BẮT BUỘC (xem reports/red-team-260718.md)
- **C2 — ADDITIVE, KHÔNG drop ngay:** thêm bảng order-centric BÊN CẠNH schema cũ. GIỮ `visit_exam_rounds/lab_orders/checklist_*/follow_ups` tới Phase 11 (139 ref trong 10 file src/ sẽ gãy build nếu drop bây giờ). Stub 2 route mồ côi (`my-checklist.$id.tsx`, `crm.tsx`) để `tsc` xanh. DROP model cũ dồn về Phase 11. KHÔNG regenerate `types.ts` phá import cho tới khi UI sẵn sàng — hoặc regen nhưng thêm bảng mới, giữ bảng cũ nên type cũ vẫn còn.
- **A2 — cột thiếu:** thêm `needs_review BOOLEAN NOT NULL DEFAULT false` vào `kb_rules` (Phase 05 trigger đọc cột này).
- **A1+A2 — view vi phạm:** `order_violations` phải (a) thêm nhánh **case-lifecycle**: order còn `open/routed/in_progress/awaiting_review` khi `visit_sessions.status='done'` → vi phạm BẤT KỂ `due_at` (vì phần lớn bước due NULL); (b) thêm `'awaiting_review'` vào nhánh overdue; (c) nhánh consent thêm `AND force_emergency=false` (A5a).
- **A5b — consent scope:** BỎ cột `consents.procedure_type` (đọc thẳng từ order con, đã = parent ở Phase 06) HOẶC set bằng trigger từ parent — không để lễ tân nhập tay lệch.
- **B1 — bảo mật `.env`:** `.env` đang bị git track (đã verify). Trước phase này: `git rm --cached .env` + thêm `.env` vào `.gitignore`. Service-role key (Phase 02) đọc từ `.dev.vars`/`.env.local`, KHÔNG phải `.env`.
- **B5 — my-checklist:** quyết số phận `/my-checklist` + `get_patient_checklist` (JOIN `lab_orders`): với additive migration, GIỮ nguyên tới Phase 11; khi drop `lab_orders` ở Phase 11 phải rewrite function map sang `medical_orders` HOẶC drop cả route+function+mục ARCHITECTURE.

## Context Links
- Brainstorm (authoritative): `plans/20260717-brainstorm-clinic-order-compliance-system/brainstorm-report.md` §4 (kiến trúc), §7.1 (3-lane), §9.1 (bỏ score), §9.2 (consent).
- Schema hiện tại: `supabase/migrations/20260717065437_*.sql` (patients/staff/user_roles/checklist_rules), `20260717100100_replace_appointments_with_visit_queue.sql` (visit_sessions/lab_orders).
- Convention RLS/realtime: `ARCHITECTURE.md` §"Realtime & RLS conventions".

## Overview
- **Priority:** P0 — nền tảng của toàn hệ thống.
- **Status:** pending.
- **Mô tả:** ĐẬP SẠCH model rounds/lab/checklist cũ; thiết kế mới lấy `medical_orders` làm trục. Giữ lại check-in/queue (số 0-999, bed_number), 4 vai, `is_staff()`/`has_role()`. Bỏ `compliance_score` khỏi mọi bảng.

## Key Insights
- Đây là project pre-launch (mọi migration đề ngày hôm nay) → được drop/recreate, KHÔNG có production data. Nhưng repo nối Lovable: migration mới phải chạy sạch một lần, branch luôn ở trạng thái chạy được.
- Y lệnh thay rounds: vòng lặp `visit_exam_rounds`/`lab_orders`/`checklist_items` cũ bị thay bằng vòng đời 1 bảng `medical_orders` (open→route→execute→evidence→close→review).
- Consent = **y lệnh con dạng cổng** (`parent_order_id`), KHÔNG phải ô đính file. Đóng bằng 4 điều kiện (scan + khớp `procedure_type` + ngày ký < ngày làm + đúng người ký).
- 3 hạng đóng (`close_mode`): `invariant` (không tick), `evidence` (tự đóng), `manual` (tick tay, tối thiểu).
- Vi phạm = VIEW deterministic (y lệnh quá hạn còn OPEN, hoặc procedure đóng khi consent gate mở). KHÔNG lưu cột score.
- EMR Synthea nạp trọn (trừ observations), tách bảng `emr_*` read-only để briefing truy xuất.

## Requirements
- FR1: enum + bảng `medical_orders`, `order_evidence`, `consents`, `kb_rules`.
- FR2: `visit_sessions` rút gọn (bỏ round/procedure/diagnosis/prescription/compliance_score) nhưng giữ queue/bed/emergency/cycle.
- FR3: bảng chính sách deterministic: `nka_systemic_flags` (Lane1 whitelist bệnh nền), `dental_snomed_whitelist` (Lane2).
- FR4: bảng `emr_*` cho Synthea import.
- FR5: view `order_violations`, `pending_review_orders`.
- FR6: storage buckets `order-evidence`, `consent-scans` (private, RLS staff).
- NFR: mọi bảng RLS `is_staff()` blanket; admin-gated cho `kb_rules`, `nka_systemic_flags`, `dental_snomed_whitelist`. Realtime cho bảng live. File migration <400 dòng (tách 2-3 file nếu cần).

## Architecture
Một migration reset (hoặc chuỗi 2-3 file theo thứ tự timestamp mới, ví dụ `20260718010000_*`). GIỮ: `patients`, `patient_allergies`, `staff`, `user_roles`, `has_role`, `is_staff`, `handle_new_user`, `daily_session_counters`, `next_daily_session_number`, `assign_session_number`. DROP phần rounds/lab/checklist/appointments/treatment_sessions và mọi cột `compliance_score`.

### Enum mới
```sql
CREATE TYPE order_type AS ENUM ('imaging','lab','procedure','medication','follow_up','referral','consent');
CREATE TYPE order_status AS ENUM ('open','routed','in_progress','awaiting_review','closed','cancelled');
CREATE TYPE order_close_mode AS ENUM ('invariant','evidence','manual');
CREATE TYPE evidence_type AS ENUM ('file_upload','appointment','consent_scan','record','manual_tick');
CREATE TYPE consent_signer AS ENUM ('patient','guardian');
-- procedure_type: MỞ RỘNG enum cũ (thêm biopsy, bone_graft, sinus_lift, perio_surgery, exam, fluoride)
--   dùng cho scope-match consent theo NHÓM. Rebuild type hoặc ALTER TYPE ADD VALUE.
-- visit_status RÚT GỌN: 'pending','called','in_exam','done','transferred' (bỏ round/lab/recall states)
```

### Bảng trục `medical_orders` (sketch)
```sql
CREATE TABLE medical_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_session_id UUID NOT NULL REFERENCES visit_sessions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),        -- denorm cho query nhanh
  parent_order_id UUID REFERENCES medical_orders(id),      -- consent gate = con của procedure
  order_type order_type NOT NULL,
  procedure_type procedure_type,                           -- cho procedure/consent scope-match
  title TEXT NOT NULL, detail TEXT,
  ordered_by UUID REFERENCES staff(id),                    -- chữ ký bác sĩ = thẩm quyền
  assigned_role app_role NOT NULL,                         -- route tới hàng đợi vai nào
  status order_status NOT NULL DEFAULT 'open',
  close_mode order_close_mode NOT NULL DEFAULT 'evidence',
  due_at TIMESTAMPTZ,                                       -- quá hạn + open = vi phạm
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ, closed_by UUID REFERENCES staff(id),
  kb_rule_id UUID REFERENCES kb_rules(id),                  -- nếu do KB điền sẵn
  is_kb_mandatory BOOLEAN NOT NULL DEFAULT false,           -- xoá bước buộc → cần exception
  exception_reason TEXT,                                    -- ghi khi xoá/bỏ bước KB buộc
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consent_needs_parent CHECK (order_type <> 'consent' OR parent_order_id IS NOT NULL)
);
```

### Bảng `order_evidence`
```sql
CREATE TABLE order_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES medical_orders(id) ON DELETE CASCADE,
  evidence_type evidence_type NOT NULL,
  file_path TEXT,                        -- storage: order-evidence bucket (imaging/record)
  followup_ref UUID,                     -- nếu evidence = lịch hẹn recall được tạo
  consent_id UUID REFERENCES consents(id),
  note TEXT,
  submitted_by UUID REFERENCES staff(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Bảng `consents` (gate detail, brainstorm §4.D)
```sql
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES medical_orders(id) ON DELETE CASCADE, -- gate con
  procedure_type procedure_type NOT NULL,   -- khớp nhóm với parent procedure
  scan_path TEXT,                            -- storage: consent-scans (KHÔNG e-signature)
  signer consent_signer,
  signed_date DATE,
  force_emergency BOOLEAN NOT NULL DEFAULT false,
  force_reason TEXT,                         -- bắt buộc khi force_emergency
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Đóng khi (Phase 05 trigger kiểm, KHÔNG tick): scan_path NOT NULL
--   AND procedure_type = parent.procedure_type
--   AND signed_date < ngày làm procedure
--   AND signer hợp lệ: age(patient.dob @ signed_date) < 18 → signer='guardian'
```

### Bảng chính sách deterministic
```sql
-- Lane1: danh sách ~6-8 bệnh nền phi-nha đổi cách làm răng (chống đông, bisphosphonate,
--   tiểu đường, thai kỳ, rối loạn đông máu, suy giảm miễn dịch). KB định nghĩa DANH SÁCH.
CREATE TABLE nka_systemic_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL, label_vi TEXT,
  match_kind TEXT NOT NULL,               -- 'condition_snomed' | 'medication_keyword' | 'medication_rxnorm'
  match_value TEXT NOT NULL,              -- mã SNOMED / keyword / RxNorm
  severity_hint TEXT, active BOOLEAN DEFAULT true
);
-- Lane2: whitelist SNOMED nha (trích từ 6 module JSON — xem Phase 03). Lọc encounter cho briefing.
CREATE TABLE dental_snomed_whitelist (
  code TEXT PRIMARY KEY, label TEXT, source_module TEXT, kind TEXT   -- 'procedure'|'condition'
);
```

### Bảng `kb_rules` (thay checklist_rules — chi tiết Phase 06)
```sql
CREATE TABLE kb_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type procedure_type NOT NULL,
  order_type order_type NOT NULL,          -- loại y lệnh nháp sẽ điền
  title TEXT NOT NULL, title_vi TEXT, detail TEXT,
  assigned_role app_role NOT NULL,
  mandatory BOOLEAN NOT NULL DEFAULT true,  -- xoá → bắt buộc exception_reason + audit
  requires_consent BOOLEAN NOT NULL DEFAULT false, -- sinh gate consent con
  close_mode order_close_mode NOT NULL DEFAULT 'evidence',
  due_offset_hours INT,                     -- due_at = opened_at + offset
  sort_order INT DEFAULT 0, active BOOLEAN DEFAULT true
);
```

### Bảng `emr_*` (Synthea, read-only reference — chi tiết nạp ở Phase 02)
`emr_patients(id, patient_id FK, synthea_id, birthdate, gender)`,
`emr_encounters(id, patient_id, code, description, class, start, stop, provider, organization)`,
`emr_conditions(id, patient_id, encounter_id, code, description, onset, abatement)`,
`emr_procedures(id, patient_id, encounter_id, code, description, date)`,
`emr_medications(id, patient_id, encounter_id, code, description, start, stop)`,
`emr_allergies(id, patient_id, code, description, severity)`,
`emr_imaging_studies(id, patient_id, encounter_id, modality, body_site, date)`,
`emr_careplans(id, patient_id, encounter_id, code, description, start, stop)`,
`emr_devices(id, patient_id, encounter_id, code, description, start)`.
- FK `patient_id` → `patients(id)` (seed script tạo patients + emr link).
- RLS: staff read (SELECT is_staff). Không realtime (dữ liệu tĩnh).

### Views (Phase 05 dùng, tạo khung ở đây)
```sql
CREATE VIEW order_violations AS
  SELECT o.*, 'overdue_open' AS violation_kind FROM medical_orders o
    WHERE o.status IN ('open','routed','in_progress') AND o.due_at < now()
  UNION ALL
  SELECT p.*, 'procedure_closed_consent_open' FROM medical_orders p
    JOIN medical_orders c ON c.parent_order_id = p.id AND c.order_type='consent'
    WHERE p.status='closed' AND c.status <> 'closed';
-- KHÔNG số điểm. Chỉ danh sách per-case.
```

### Storage buckets
`order-evidence` (imaging/record files), `consent-scans` (giấy ký scan). Cả hai private, `storage.objects` RLS `is_staff(auth.uid())`.

## Related Code Files
**Create (migrations, `supabase/migrations/`):**
- `20260718010000_reset_order_centric_core.sql` — drop model cũ + enum + `visit_sessions` rút gọn + `medical_orders` + `order_evidence` + `consents` + `kb_rules` + RLS + realtime.
- `20260718010100_emr_reference_tables.sql` — bảng `emr_*` + RLS read.
- `20260718010200_policy_and_views.sql` — `nka_systemic_flags`, `dental_snomed_whitelist`, views, storage buckets.

**Modify:**
- `src/integrations/supabase/types.ts` — regenerate types sau migration (`supabase gen types`).

**Delete (logic, không xoá file — thay trong migration):** khái niệm `visit_exam_rounds`, `lab_orders`, `checklist_items`, `checklist_rules`, `follow_ups`, `appointments`, `treatment_sessions`, mọi cột `compliance_score`.

## Implementation Steps
1. Tạo file migration `..._reset_order_centric_core.sql`. Mở đầu bằng khối DROP an toàn (idempotent) mọi bảng/type/function của model rounds/lab/checklist/appointments (theo `20260717100100`).
2. Rebuild/ALTER `procedure_type` enum thêm giá trị: `biopsy`, `bone_graft`, `sinus_lift`, `perio_surgery`, `exam`, `fluoride` (dùng cho scope-match consent + KB). Nếu rebuild type: drop cột phụ thuộc trước.
3. Rebuild `visit_status` enum rút gọn `('pending','called','in_exam','done','transferred')`.
4. Tạo `visit_sessions` rút gọn: giữ `session_number/bed_number/is_emergency/status/root_session_id/cycle_number/chief_complaint/assigned_dentist_id/created_by/created_at/closed_at`. BỎ `current_round/procedure_type/diagnosis/treatment_plan/prescription/compliance_score`. Giữ trigger `assign_session_number` + `daily_session_counters`.
5. Tạo enum order_* + bảng `kb_rules` (trước `medical_orders` vì FK), `medical_orders`, `order_evidence`, `consents` theo sketch. Thêm index: `(status)`, `(assigned_role,status)`, `(patient_id)`, `(due_at)`, `(parent_order_id)`.
6. RLS blanket `is_staff()` cho `medical_orders/order_evidence/consents`; admin-gated cho `kb_rules`.
7. Realtime: ADD `medical_orders`, `order_evidence`, `alerts`, `visit_sessions` vào `supabase_realtime` + `REPLICA IDENTITY FULL`.
8. Giữ bảng `alerts` (repoint `session_id`→`visit_sessions`; thêm cột `order_id UUID REFERENCES medical_orders(id)`).
9. File `..._emr_reference_tables.sql`: tạo 9 bảng `emr_*` + RLS SELECT staff. Index `(patient_id)`, `(encounter_id)`, `(code)`.
10. File `..._policy_and_views.sql`: `nka_systemic_flags` (+ seed 6-8 dòng: warfarin/DOAC keyword, bisphosphonate keyword, Diabetes SNOMED `44054006`, pregnancy, coagulation disorder, immunosuppression), `dental_snomed_whitelist` (rỗng — Phase 03 seed), views, buckets + storage RLS.
11. Chạy migration local (`supabase db reset` hoặc apply) — xác nhận sạch. Regenerate `types.ts`.
12. Grep repo tìm `compliance_score`, `lab_orders`, `visit_exam_rounds`, `checklist` — ghi danh sách file UI sẽ hỏng để các phase UI biết mà sửa/xoá (đừng sửa UI ở phase này).

## Todo List
- [ ] Migration reset core (drop model cũ + enum + visit_sessions rút gọn)
- [ ] `medical_orders` + `order_evidence` + `consents` + `kb_rules` + index + RLS
- [ ] `alerts` repoint + cột `order_id`
- [ ] Realtime publication + REPLICA IDENTITY
- [ ] 9 bảng `emr_*` + RLS read
- [ ] `nka_systemic_flags` (seed 6-8) + `dental_snomed_whitelist` (rỗng)
- [ ] Views `order_violations`, `pending_review_orders`
- [ ] Storage buckets `order-evidence`, `consent-scans` + RLS
- [ ] Apply migration sạch + regenerate types.ts
- [ ] Grep `compliance_score` — lập danh sách file UI cần dọn

## Success Criteria
- `supabase db reset` chạy hết không lỗi.
- `\d medical_orders` có đủ cột trục; `SELECT * FROM order_violations` chạy (rỗng OK).
- KHÔNG còn `compliance_score` trong bất kỳ CREATE TABLE nào.
- `types.ts` regenerate có type `medical_orders`, `consents`, `kb_rules`, `emr_*`.

## Risk Assessment
- **Rebuild enum `procedure_type` phá cột phụ thuộc** → drop cột dùng enum trước, hoặc dùng `ALTER TYPE ... ADD VALUE` (không cần rebuild) nếu chỉ thêm value. Ưu tiên ADD VALUE.
- **Migration nửa chừng lỗi** → mọi khối idempotent (DROP IF EXISTS đầu file), branch vẫn chạy được.
- **Lovable sync** → không rewrite history; commit migration mới, không sửa migration đã push.

## Security Considerations
- `emr_*` chứa PII bệnh sử → RLS SELECT `is_staff()` bắt buộc, KHÔNG cấp anon.
- Storage buckets private; RLS `is_staff()`. Consent scans nhạy cảm — không public URL.
- `kb_rules`/`nka_systemic_flags` admin-gated (chính sách, chỉ admin sửa).
- Trigger functions REVOKE EXECUTE khỏi authenticated/anon (theo convention `20260717100100`).

## Next Steps
- Phase 02 nạp Synthea vào `emr_*`.
- Phase 05 viết trigger vòng đời + logic đóng consent trên bảng ở đây.
- Phase 06 seed `kb_rules`.
