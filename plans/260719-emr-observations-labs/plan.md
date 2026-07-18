---
title: EMR Observations & Labs (Customer Graph part 2)
status: code-complete (P01 áp+ETL xong; P02/P05/P06 migration chờ áp; P05-UI tách sau)
created: 2026-07-19
builds_on: [260718-0111-order-centric-clinic-system, 260718-compliance-judge-rag, 260718-ai-meeting-copilot]
blockedBy: []
blocks: []
---

# EMR Observations & Labs — Overview

Lấp gap backend: `observations.csv` (labs/vitals) chưa được đưa vào Customer Graph — không có `emr_observations`. Đưa **giá trị xét nghiệm cụ thể** (INR, HbA1c, tiểu cầu, HA, đường huyết, hút thuốc…) vào hồ sơ để bác sĩ đọc và để an toàn nha khoa nổi lên tại điểm ký y lệnh.

**Nguyên tắc (bám bất biến hệ thống):** KB định nghĩa cái gì đáng quan tâm (whitelist LOINC) → Graph truy xuất **SỰ THẬT** (value + đơn vị + ngày + **khoảng tham chiếu KB**), KHÔNG phán "bất thường". Deterministic-first · retrieval-not-inference · KHÔNG score · human-first (bác sĩ diễn giải theo bối cảnh, hệ thống chỉ thuật số).

## Kiến trúc (mirror pattern sẵn có: dental_snomed_whitelist + emr_* + 3-lane RPC)
- **KB layer** `emr_observation_whitelist` (LOINC PK, label_vi, category, unit, ref_low/high, relevance_vi, related_flag → nối `nka_systemic_flags`). Seed ~11 mã ĐÃ VERIFY có thật trong data.
- **Fact layer** `emr_observations` (patient_id, encounter_id?, loinc_code, value_num?/value_text?, unit, observed_at, `source` synthea|clinic). ETL chỉ nạp dòng khớp whitelist.
- **Retrieval** Lane-1 `get_safety_panel` +mảng `observations` (mới nhất/mã) · RPC mới `get_observation_history` cho trang hồ sơ + copilot.

## Verify data (đã làm lúc plan — read-only)
observations.csv = 1.6GB, ~8.96M dòng, CRLF. Cột: DATE,PATIENT,ENCOUNTER,CATEGORY,CODE(5),DESCRIPTION,VALUE,UNITS,TYPE.
Mã dental-relevant CÓ THẬT: 6301-6 INR (4465) · 777-3 tiểu cầu (37892) · 5902-2 PT · 3173-2 aPTT · 4548-4 HbA1c (92k) · 2339-0 glucose (106k) · 8480-6/8462-4 HA (167k) · 72166-2 hút thuốc (152k) · 6690-2 WBC · 38483-4 creatinine.

## Phases
| # | Phase | Ưu tiên | File |
|---|---|---|---|
| 01 | Schema + whitelist seed + ETL observations pass + verify overlap | cao (nền) | [phase-01](phase-01-schema-etl.md) |
| 02 | Lane-1 retrieval (safety_panel + history RPC) + UI hồ sơ | cao | [phase-02](phase-02-retrieval-ui.md) |
| 03 | Compliance Judge — ghép value cạnh cờ hệ thống (killer demo) | cao | [phase-03](phase-03-judge-integration.md) |
| 04 | Copilot patient_labs tool + i18n | trung bình | [phase-04](phase-04-copilot-tool.md) |
| 05 | Nhập lâm sàng sống — backend trigger ✓ (UI tách sau) | trung bình | [phase-05](phase-05-live-clinic.md) |
| 06 | Ops report metric (BN chống đông thiếu INR) — ✓ code | thấp | [phase-06](phase-06-ops-metric.md) |

## Trạng thái triển khai (2026-07-19)
- **P01 HOÀN TẤT thực thi:** migration áp + ETL nạp 319,175 observations/800 BN; verify 150 BN có INR (khớp), parse đúng. Demo: BN `e15aa738` INR=2.8 + warfarin.
- **P02/P03/P04 code xong** (tsc/build sạch). Chờ áp migration `20260719100100` (get_safety_panel +observations, get_observation_history) để test killer demo + copilot.
- **P05 backend xong** (migration `20260719100200`: ALTER lab_orders + trigger emit clinic observation). **UI nhập kết quả TÁCH sang phiên sau** (repo chưa có màn lab-tech hoàn tất lab).
- **P06 code xong** (migration `20260719100300`: CREATE OR REPLACE get_ops_metrics + highlight anticoag_missing_inr).
- **Migration:** `100100`/`100200`/`100300` ĐÃ ÁP + verify. Còn `100400` (fix W1: observed_at SET NOT NULL) CHỜ ÁP.
- **Verify đã chạy (service key):** get_safety_panel trả 10 observations đúng value+đơn vị+ngày+ref; get_observation_history INR 7 dòng; get_ops_metrics.highlights.anticoag_missing_inr=253.
- **BN demo killer (P03):** `f86cfba8-3d57-5987-3187-7ee6f9c5d7f0` **Minh Nguyễn** — warfarin đang dùng + INR (cờ sạch "Anticoagulant: warfarin"). Dự phòng: `6ed94250…` Long Trần (warfarin+aspirin+clopidogrel+INR 1.1).
- **Code-review 8/10, 0 critical.** W1 (NULLS ordering) → fix `100400`. W2 (clinic trigger chưa UI) → P05-UI tách. Nit ref lo-only → sửa deterministic.ts.
- Drive UI test: mở BN Minh Nguyễn → ký extraction → dialog Judge hiện observation_fact "INR … (tham chiếu 0.8–1.2) — dữ kiện đã ghi, bác sĩ diễn giải" cạnh cờ warfarin.

## Ràng buộc
Migration áp tay SQL Editor (immutable, đặt tên `20260719xxxxxx_`) · file <200 dòng · i18n vi+en · `ordersDb`/`db as any` cho types cũ · RPC SECURITY INVOKER + RLS staff-read (hoặc DEFINER + is_staff guard theo pattern get_safety_panel) · trigger SECURITY DEFINER + search_path + REVOKE client · KHÔNG thêm lib.

## Ranh giới suy diễn (chốt với user)
- Hiện **value + đơn vị + ngày + khoảng tham chiếu KB chuẩn**. KHÔNG cờ H/L, KHÔNG màu cảnh báo, KHÔNG "cao/nguy hiểm".
- INR ref = ngưỡng lab chuẩn (0.8–1.2); BN warfarin INR 2.5 là therapeutic-normal → **bác sĩ diễn giải**, hệ thống KHÔNG tự chỉnh ref theo chỉ định (= tránh inference).
- Judge chỉ thuật "INR 3.5 (2026-05) + đang dùng warfarin" — KHÔNG "đừng nhổ".
