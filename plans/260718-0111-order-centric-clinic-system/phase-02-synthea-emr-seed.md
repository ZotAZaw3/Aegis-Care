# Phase 02 — Synthea EMR seed script [24h-core]

## ⚠ RED-TEAM FIXES — BẮT BUỘC (xem reports/red-team-260718.md)
- **C3 — cắt khỏi đường 24h:** ETL 3.3GB nằm cứng trong critical path briefing, giá trị demo thấp/rủi ro giờ cao. **24h dùng seed tay 2-3 BN dày** (1 implant nhiều tầng + 1 oral cancer): grep vài chục dòng theo `PATIENT` id từ CSV, viết thẳng 1 file SQL seed. Full ETL để post-24h. Lane1 (dị ứng/warfarin/apixaban) test được chỉ với vài dòng `patient_allergies` + `emr_medications` nhập tay.
- **B1 — key:** service-role key đọc từ `.dev.vars` hoặc `.env.local` (đã gitignore), **KHÔNG phải `.env`** (đang bị track). Success Criteria verify `git ls-files | grep -c '\.env$' == 0`.
- **B6 — liên kết bền:** thêm cột `synthea_encounter_id TEXT` (+ index) vào `emr_encounters` để nối `conditions/procedures.ENCOUNTER` bền + re-run reconstruct được. Bọc mỗi patient trong 1 transaction (delete+insert atomic). Idempotency test chạy lần 3 với tập BN khác để bắt rác.

## Context Links
- Brainstorm §7 (vai trò dataset), §7.1 (nạp trọn, lọc lúc đọc).
- Dataset: `synthea-dental-dataset/README.md` (17 CSV, khóa `patients.Id`→`<bảng>.PATIENT`, `encounters.Id`→`<bảng>.ENCOUNTER`).
- CSV thật tại `synthea-dental-dataset/csv/` (3.34GB — KHÔNG load trọn).
- Bảng đích: `emr_*` (Phase 01).

## Overview
- **Priority:** P0 cho nhánh briefing (Phase 04 cần data thật để demo).
- **Status:** pending.
- **Mô tả:** Script nạp ~30-50 bệnh nhân bệnh sử DÀY (ưu tiên implant/viêm quanh implant/ung thư miệng) vào `patients` + `emr_*`. Nạp TRỌN record của các BN được chọn (bỏ `observations.csv` 1.5GB, GIỮ `allergies`+`medications`). KHÔNG tiền lọc nha khoa lúc nạp.

## Key Insights
- Chọn BN giàu bối cảnh (§7): 321 implant, 27 viêm quanh implant, 15 ung thư miệng — nơi briefing tỏa sáng vì bệnh sử nhiều tầng.
- **Nạp trọn, lọc lúc đọc** (§7.1): tiền lọc subset nha = cắt mất sự thật an toàn toàn thân (warfarin ghi ở khám tim mạch). Lane1 cần TOÀN THÂN.
- Bỏ `observations.csv` chỉ vì dung lượng — GIỮ `allergies`+`medications` (Lane1 sống nhờ 2 bảng này).
- KHÔNG lọc theo `SPECIALITY`/`SPECIALITY` bác sĩ (README §3: mọi provider bị ép thành RHM).
- Nhân khẩu đã Việt-hóa; lâm sàng giữ SNOMED + mô tả English → briefing hiển thị English clinical là OK.
- Dataset KHÔNG có y lệnh (careplans gần nhất) → y lệnh do bác sĩ tự viết trong app, KHÔNG relate dataset, KHÔNG fake.

## Requirements
- FR1: script (Node/TS chạy 1 lần, hoặc Python) đọc CSV, chọn 30-50 patient_id mục tiêu, nạp vào `patients` + `emr_*` qua Supabase service role.
- FR2: chọn BN: quét `procedures.csv`/`conditions.csv` tìm mã implant/peri-implantitis/oral cancer, lấy ~30-50 BN có nhiều encounter nhất.
- FR3: map cột CSV → cột `emr_*` (giữ code + description + ngày).
- FR4: tạo row `patients` (full_name/dob/gender/phone từ `patients.csv` đã Việt-hóa) + `emr_patients` link; nạp `patient_allergies` từ `allergies.csv` (cho Lane1 hard-query).
- NFR: idempotent (chạy lại không nhân đôi — upsert theo synthea_id). Không commit CSV vào repo. Script <200 dòng (tách module đọc CSV / map / insert).

## Architecture
Script `scripts/seed-synthea-emr.ts` (chạy bằng `tsx`/`node`), dùng `@supabase/supabase-js` với `SERVICE_ROLE_KEY` từ `.env` (KHÔNG commit). Luồng:
```
1. streaming đọc procedures.csv + conditions.csv → tập candidate patient_id (mã mục tiêu)
2. rank theo #encounters (đọc encounters.csv đếm) → chọn top 30-50
3. với mỗi patient_id: đọc slice từ mỗi CSV (trừ observations) lọc theo PATIENT
4. upsert patients + emr_patients + emr_encounters + emr_conditions + emr_procedures
   + emr_medications + patient_allergies + emr_allergies + emr_imaging_studies
   + emr_careplans + emr_devices
```
Vì CSV lớn (encounters 302MB, procedures 663MB), đọc theo **stream** (`readline`/`csv-parse` stream), lọc dòng theo set patient_id đã chọn — KHÔNG load cả file vào RAM.

**Mã mục tiêu (chọn BN):** implant cấy trụ, viêm quanh implant, SCC khoang miệng — tra code cụ thể từ 3 module JSON `E:/Documents/VAIC 2026/synthea/modules/dental_implant.json`, `oral_cancer.json`, `periodontal_disease.json` (hoặc grep description chứa "implant"/"carcinoma"/"peri-implant").

## Related Code Files
**Create:**
- `scripts/seed-synthea-emr.ts` — entry (orchestrate).
- `scripts/synthea/csv-stream.ts` — helper stream + filter theo patient set (<100 dòng).
- `scripts/synthea/emr-mappers.ts` — map dòng CSV → object insert từng bảng (<200 dòng).
- `scripts/synthea/README.md` — cách chạy (env var, lệnh).
- `.env.example` — thêm `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SYNTHEA_CSV_DIR`.

**Modify:** `package.json` — thêm script `"seed:synthea": "tsx scripts/seed-synthea-emr.ts"`; devDep `csv-parse`, `tsx` nếu chưa có.

**Read for context:** `synthea-dental-dataset/csv/*.csv` (header), `src/integrations/supabase/client.ts` (URL pattern).

## Implementation Steps
1. Xác định bộ mã chọn BN: grep 3 module JSON lấy SNOMED implant/peri-implantitis/oral-cancer; fallback grep description CSV.
2. `csv-stream.ts`: hàm `streamRows(path, onRow)` + `collectPatientIds(path, codeSet)` trả `Set<string>`.
3. Pass 1: quét `procedures.csv` + `conditions.csv` → candidate set. Pass 2: đếm encounter/patient trên `encounters.csv`, sort desc, cắt top 40.
4. `emr-mappers.ts`: mỗi bảng một mapper thuần (dòng CSV → record). Xử lý ngày rỗng, cột thiếu.
5. Pass 3: với từng CSV (trừ observations/claims), stream, lọc `PATIENT ∈ chosen`, batch upsert (500 dòng/lần) qua service role.
6. `patients`: từ `patients.csv` map full_name/dob(BIRTHDATE)/gender/phone; `emr_patients` giữ `synthea_id` + `birthdate` (cho consent age check). `patient_allergies` từ `allergies.csv` (severity map).
7. Idempotent: upsert `onConflict: synthea_id` cho `emr_patients`; các bảng con xóa-rồi-nạp theo patient trước khi insert (tránh trùng khi chạy lại).
8. In summary: #patients, #encounters, #conditions, #procedures, #medications, #allergies đã nạp.
9. Chạy thật, xác nhận ≥1 ca implant + ≥1 ca oral cancer có bệnh sử dày (≥30 encounter).

## Todo List
- [ ] Xác định bộ mã SNOMED chọn BN (implant/peri-implant/oral cancer)
- [ ] `csv-stream.ts` stream + filter helper
- [ ] Chọn top 30-50 BN theo #encounter
- [ ] `emr-mappers.ts` cho 9 bảng emr + patients + allergies
- [ ] Batch upsert service role, idempotent
- [ ] `.env.example` + `package.json` script + devDeps
- [ ] Chạy seed thật, in summary, xác nhận ca dày
- [ ] `scripts/synthea/README.md`

## Success Criteria
- `SELECT count(*) FROM emr_patients` = 30-50; `emr_encounters` hàng nghìn dòng.
- ≥1 BN có encounter implant + ≥1 BN có oral cancer.
- `patient_allergies` có dòng cho các BN có dị ứng (Lane1 test được).
- Chạy `seed:synthea` lần 2 KHÔNG nhân đôi row.
- KHÔNG có file CSV/`.env` nào bị stage vào git.

## Risk Assessment
- **CSV quá lớn ngốn giờ** → stream + lọc sớm theo patient set; chỉ đọc, không giữ RAM. Giảm số BN nếu chậm.
- **Ngày/format lệch** → mapper defensive (null-safe), skip dòng hỏng + log.
- **Service role key rò rỉ** → chỉ đọc từ `.env` (gitignore), KHÔNG hardcode, KHÔNG in ra log.

## Security Considerations
- Service role bypass RLS → chỉ chạy local/CI có kiểm soát, key không commit.
- Dữ liệu synthetic (README: không HIPAA) — an toàn để nạp, nhưng vẫn RLS staff-only khi đọc qua app.

## Next Steps
- Phase 03 dựng whitelist + Lane1 query trên data này.
- Phase 04 briefing đọc `emr_*` của các BN vừa nạp.
