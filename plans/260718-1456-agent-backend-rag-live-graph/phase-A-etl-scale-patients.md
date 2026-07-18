# Phase A — ETL 500-1000 bệnh nhân giàu nha khoa

## Context Links
- Brainstorm §6.1 (authoritative): `plans/260718-brainstorm-rag-kb-integration/brainstorm-report.md`
- Pattern gốc (3 BN): `supabase/seed-demo-patients.mjs` (streaming CSV, quote-aware parse, idempotent)
- Schema đích: `supabase/migrations/20260718020200_emr_reference_tables.sql`
- Whitelist ranking: `supabase/migrations/20260718060100_seed_dental_snomed_whitelist.sql`, `20260718020300_policy_and_views.sql` (bảng `dental_snomed_whitelist(code,label,kind)`)
- Lane1 flags: `supabase/migrations/20260718060200_expand_systemic_flags.sql`

## Overview
- **Priority:** cao (nền cho test D). Độc lập B/C.
- **Status:** pending.
- Nạp 500-1000 BN Synthea vào `patients` + `emr_*` (trừ observations), chọn theo độ giàu nha khoa + bệnh nền Lane1. Giữ nguyên 3 BN demo cũ. Idempotent, stream (không load cả file), transaction/BN.

## Key Insights
- CSV lớn: `encounters.csv` 310MB, `procedures.csv` 670MB, `medications.csv` 166MB, `observations.csv` 1.5GB (BỎ), `imaging_studies.csv` 450MB. → BẮT BUỘC stream line-by-line (`readline`), không `readFileSync`.
- `patients.id` = Synthea UUID (seed cũ set thế) → `patient_id` deterministic → delete-then-insert theo `patient_id` là idempotent.
- Bảng con (`emr_conditions/procedures/...`) KHÔNG có unique key tự nhiên → không upsert được theo key; phải xoá-rồi-chèn theo patient để tránh nhân đôi khi chạy lại.
- 3 BN demo (`7fb1293d`, `28db9679`, `06edd1f4`) tự nhiên nằm trong tập chọn nếu ranking đúng; ép cứng vào set để chắc chắn.
- Service role key KHÔNG có trong repo → đọc từ `.dev.vars` (gitignored, phải tự tạo). `client.server.ts` đọc `process.env.SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY`.

## Requirements
**Functional**
- Chọn 500-1000 BN theo điểm: dental-richness (code ∈ whitelist HOẶC description khớp `implant|periodont|nha chu|oral cancer|ung thư (miệng|khoang miệng)|orthodont|chỉnh nha|extraction|root canal`) + bonus Lane1 (medication description khớp `warfarin|apixaban|rivaroxaban|dabigatran|clopidogrel|aspirin|heparin|bisphosphonate|alendronate|zoledron` hoặc condition khớp `diabetes|tiểu đường`).
- Nạp trọn record/BN: `patients`, `patient_allergies` (Lane1 display), `emr_patients/encounters/conditions/procedures/medications/allergies/imaging_studies/careplans/devices`. BỎ observations.
- Idempotent: chạy lại không nhân đôi, không đụng BN ngoài tập.

**Non-functional**
- Bộ nhớ ổn định (stream). Chạy offline một lần; thời gian phút-đến-chục-phút chấp nhận.
- Không hardcode secret; đọc `.dev.vars`.

## Architecture
Script Node `supabase/etl-synthea-patients.mjs` (module hoá, được phép >200 dòng), 2 pass:

```
Pass 1 (SELECT):  stream conditions.csv + medications.csv + devices.csv + careplans.csv
                  → Map<patientId, score> (chỉ giữ aggregate nhỏ; ~11.5k entries OK)
                  → rank desc, lấy top N (500..1000) ∪ {3 demo ids} = SELECTED set
Pass 2 (LOAD):    stream từng CSV lần 2, filter row.PATIENT ∈ SELECTED
                  → gom theo patient → gọi upsert atomic/BN
```

Idempotent atomic/BN qua RPC (khuyến nghị — supabase-js `.rpc()` vẫn là driver):

```sql
-- migration: etl_upsert helper (SECURITY DEFINER, chỉ service_role)
CREATE OR REPLACE FUNCTION public.etl_upsert_patient(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid := (p->>'patient_id')::uuid;
BEGIN
  DELETE FROM public.emr_conditions   WHERE patient_id = v_pid;
  DELETE FROM public.emr_procedures   WHERE patient_id = v_pid;
  -- ... các bảng con + patient_allergies + emr_patients
  DELETE FROM public.patients         WHERE id = v_pid;   -- CASCADE dọn con còn sót
  INSERT INTO public.patients        SELECT * FROM jsonb_populate_recordset(NULL::public.patients,        p->'patients');
  INSERT INTO public.emr_encounters  SELECT * FROM jsonb_populate_recordset(NULL::public.emr_encounters,  p->'encounters');
  -- ... phần còn lại
END $$;
REVOKE EXECUTE ON FUNCTION public.etl_upsert_patient(jsonb) FROM PUBLIC, anon, authenticated;
```
> DELETE-then-INSERT trong 1 hàm = transaction/BN (atomic). Nếu KHÔNG muốn thêm RPC:
> fallback thuần supabase-js = `.delete().eq('patient_id',pid)` từng bảng rồi `.insert()`
> theo batch ≤500 dòng — idempotent nhưng KHÔNG atomic/BN (chấp nhận cho seed offline).
> Chọn RPC để đúng ràng buộc "transaction per patient".

Cột CSV: dùng đúng index như `seed-demo-patients.mjs` (patients FIRST=7/LAST=9/GENDER=15, encounters, conditions, procedures, medications, allergies, imaging, careplans, devices — copy nguyên map cột).

## Related Code Files
**Create**
- `supabase/etl-synthea-patients.mjs` — script chính (parse + score + load). Tách module con nếu >200 dòng: `supabase/etl/csv-stream.mjs` (readCsv/parseLine — copy từ seed), `supabase/etl/patient-ranker.mjs` (scoring).
- `supabase/migrations/20260718100000_etl_upsert_helper.sql` — RPC `etl_upsert_patient` (nếu chọn hướng RPC).
- `.dev.vars` (gitignored, KHÔNG commit) — `SUPABASE_URL=...`, `SUPABASE_SERVICE_ROLE_KEY=...`.

**Modify** — không sửa file production; chỉ đọc pattern seed cũ.

**Delete** — không.

## Implementation Steps
1. Tạo `.dev.vars` với `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (lấy từ Supabase dashboard → Project Settings → API → service_role). Xác nhận `.dev.vars` đã trong `.gitignore` (đã có).
2. Copy `parseLine`/`readCsv` từ `seed-demo-patients.mjs` sang `supabase/etl/csv-stream.mjs`.
3. Viết `patient-ranker.mjs`: hằng regex whitelist-desc + Lane1; hàm `scoreRow(table,row)`. Load `dental_snomed_whitelist` codes 1 lần qua supabase-js `.select('code')` để so code chính xác.
4. Pass 1: stream conditions/medications/devices/careplans → tích luỹ `Map<pid,score>`. Log phân bố điểm.
5. Rank + cắt top N (tham số CLI `--limit`, mặc định 800). `SELECTED = topN ∪ demoIds`.
6. (Nếu RPC) viết + áp migration `etl_upsert_helper.sql` qua Supabase SQL Editor.
7. Pass 2: stream mọi CSV cần, gom row theo pid vào buffer; khi đọc xong (hoặc theo patient boundary) build payload jsonb/BN → `supabase.rpc('etl_upsert_patient', { p })`. Giới hạn concurrency (vd 5 BN song song) để không quá tải.
8. Xử lý `patient_allergies` (bỏ "Allergic disposition") + `emr_patients.synthea_id` như seed cũ.
9. Chạy `node supabase/etl-synthea-patients.mjs --limit 800`; kiểm đếm bảng.
10. Chạy lại lần 2 để chứng minh idempotent (đếm không đổi).
11. `npm run lint` cho file .mjs mới; typecheck không áp cho .mjs nhưng đảm bảo không lỗi cú pháp (`node --check`).

## Todo List
- [ ] Tạo `.dev.vars` (service role) — KHÔNG commit
- [ ] `csv-stream.mjs` (copy parse/stream)
- [ ] `patient-ranker.mjs` (scoring dental + Lane1)
- [ ] Pass 1 scoring + ranking + ép 3 demo ids
- [ ] (Tùy chọn) migration `etl_upsert_patient` RPC
- [ ] Pass 2 load + upsert atomic/BN
- [ ] patient_allergies + emr_patients
- [ ] Chạy thật `--limit 800`, verify counts
- [ ] Chạy lại → idempotent (counts bất biến)
- [ ] lint + node --check

## Success Criteria (đo được)
- `SELECT count(*) FROM patients` ≥ 503 (500 + 3 demo) và ≤ 1003.
- 3 BN demo còn nguyên: `SELECT count(*) FROM patients WHERE id IN ('7fb1293d-...','28db9679-...','06edd1f4-...')` = 3.
- `emr_encounters/procedures/medications` có ≥1 dòng cho ≥90% BN đã chọn.
- Chạy script lần 2 → mọi `count(*)` giữ nguyên (idempotent).
- `get_safety_panel(<BN warfarin>)` trả `systemic_flags` không rỗng cho BN mới có thuốc chống đông.
- Không có secret trong `git status`/diff.

## Risk Assessment
- **Bộ nhớ vỡ nếu lỡ load cả file** → chỉ dùng `readline` stream; Map chỉ giữ số. Mitigate: test với `--limit` nhỏ trước.
- **Payload RPC quá lớn/BN nhiều encounter** → chia batch trong payload hoặc gọi nhiều lần/BN; giới hạn concurrency.
- **Ranking bỏ sót BN thú vị** → giữ regex rộng + bonus Lane1; log top-50 để mắt thường soi.
- **Encounter FK cho con**: seed cũ set con.encounter_id NULL nếu enc không thuộc set — giữ logic `encIds.has(...)` theo từng BN.

## Security Considerations
- Service role bypass RLS → CHỈ chạy local/offline, key trong `.dev.vars`. KHÔNG đưa vào bundle client, KHÔNG commit.
- RPC `etl_upsert_patient` REVOKE khỏi anon/authenticated (chỉ service_role/definer).
- emr_* là PII → RLS staff-read đã có (Phase 01); ETL không đổi RLS.

## Next Steps
- Cung cấp data thật cho Phase D test (`patient_history`, `safety_panel`, `crm_recall`).
- Không chặn B/C.
