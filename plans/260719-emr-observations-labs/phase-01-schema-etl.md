# Phase 01 — Schema + whitelist seed + ETL observations + verify overlap

## Context
- ARCHITECTURE.md (3-lane), `supabase/migrations/20260718020200_emr_reference_tables.sql` (pattern emr_*), `scripts/etl-synthea-patients.mjs` (ETL pass), `20260718020300_policy_and_views.sql` (dental_snomed_whitelist + nka_systemic_flags pattern).

## Overview
- **Priority:** cao — nền sự thật cho mọi phase sau. Độc lập.
- Nạp labs curated (đã verify có thật) vào Graph, read-only Synthea trước (source='synthea').

## Key Insights
- observations.csv: 1.6GB, CRLF, cột DATE,PATIENT,ENCOUNTER,CATEGORY,CODE(idx4),DESCRIPTION,VALUE(idx6),UNITS(idx7),TYPE(idx8). TYPE ∈ numeric|text.
- Whitelist là "KB định nghĩa" — chỉ nạp mã trong bảng → bảng emr_observations nhỏ, tín hiệu cao.
- **Rủi ro #1 đã verify:** mã LOINC khớp data. Còn phải verify BN đã chọn có INR (INR chỉ 4465 dòng toàn bộ, chủ yếu BN chống đông).

## Requirements
**Functional**
- Bảng `emr_observation_whitelist(loinc_code text PK, label text, label_vi text, category text, unit text, ref_low numeric, ref_high numeric, relevance_vi text, related_flag text, active boolean DEFAULT true)`. Seed ~11 mã:
  - 6301-6 INR (ref 0.8–1.2, related_flag='anticoagulant', relevance nhổ/phẫu chảy máu)
  - 777-3 Tiểu cầu (150–400), 5902-2 PT (11–13.5), 3173-2 aPTT (25–35) — bleeding
  - 4548-4 HbA1c (<5.7), 2339-0 Glucose (70–100) — tiểu đường/lành thương
  - 8480-6 HA tâm thu (<120), 8462-4 HA trương (<80) — tiền mê epinephrine
  - 72166-2 Hút thuốc (text, no range) — implant/perio; 6690-2 WBC (4–11), 38483-4 Creatinine (0.6–1.2)
- Bảng `emr_observations(id uuid pk, patient_id uuid FK, encounter_id uuid FK null, loinc_code text, description text, value_num numeric null, value_text text null, unit text, observed_at timestamptz, source text DEFAULT 'synthea')`. Index (patient_id, loinc_code, observed_at desc); index (patient_id).
- RLS: staff SELECT (như emr_*); whitelist staff read + admin write. GRANT service_role ALL.
- ETL: thêm PASS trong `etl-synthea-patients.mjs` — stream observations.csv, giữ dòng `sel.has(PATIENT) AND CODE ∈ whitelistSet`. Map: TYPE=numeric→value_num=parseFloat(VALUE), else value_text=VALUE. observed_at=DATE, unit=UNITS. Child table (delete-by-patient + insert). Load whitelist codes từ DB đầu ETL (như PASS1 load dental codes).

**Non-functional**
- 1 migration `20260719100000_emr_observations.sql`. ETL thêm 1 stream pass (~1–2 phút offline). Idempotent (delete children by patient_id).

## Related Code Files
**Create:** `supabase/migrations/20260719100000_emr_observations.sql`
**Modify:** `scripts/etl-synthea-patients.mjs` (whitelist load + observations pass + emr_observations vào CHILD_TABLES)

## Implementation Steps
1. Migration: 2 bảng + seed whitelist + RLS/grants/index.
2. ETL: load whitelist Set; thêm `streamCount("observations.csv", ...)` filter; push rows.emr_observations; thêm 'emr_observations' vào CHILD_TABLES.
3. Áp migration; chạy `node scripts/etl-synthea-patients.mjs --ids <DEMO_IDS>` test nhỏ rồi full.
4. **Verify overlap:** SQL đếm BN có ≥1 INR: `SELECT count(DISTINCT patient_id) FROM emr_observations WHERE loinc_code='6301-6'`. Đếm BN chống đông (emr_medications ∩ anticoagulant keywords). Nếu 3 DEMO_IDS thiếu INR → tìm 2–3 synthea_id có INR+warfarin trong data, thêm vào DEMO_IDS, re-run ETL.

## Todo List
- [ ] Migration 2 bảng + seed 11 mã whitelist (ref range thực)
- [ ] ETL observations pass + CHILD_TABLES
- [ ] Áp + ETL full
- [ ] Verify overlap INR↔BN chống đông; force-seed nếu thưa

## Success Criteria
- `emr_observations` có dòng cho DEMO patients; ≥5 BN demo có INR (đủ cho P03 demo).
- Whitelist 11 mã, mỗi mã ref range hợp lý.
- Re-run ETL không nhân đôi (idempotent).

## Risks
- **BN chọn không có INR** → verify + force-seed BN chống đông có INR (bước 4). BẮT BUỘC trước P03.
- **VALUE không parse được số** (text trong field numeric) → parseFloat NaN → để value_num NULL, giữ value_text raw.
- **CRLF** → csv-stream.mjs đã xử lý (các pass khác chạy OK).

## Security
- RLS staff-read (PII bệnh sử). Whitelist admin-write. Không anon.

## Next
- P02 đọc emr_observations. P01 KHÔNG phụ thuộc phase khác.
