# Phase 09 — UI Lễ tân: check-in/queue + consent scan + recall [24h-core]

> **Skill:** invoke `/ui-ux-pro-max` cho polish check-in + consent form.

## Context Links
- Brainstorm §4.D (consent gate), §9.3 (lễ tân — hàng đợi quan trọng nhất), §10 (recall).
- Deps: `visit_sessions`/queue (Phase 01), consent gate + auto-close (Phase 05), storage `consent-scans` (Phase 01).
- Route thay thế: `src/routes/_authenticated/checkin.tsx` + phần follow-up.

## Overview
- **Priority:** P0 — bất đồng bộ bác sĩ↔lễ tân là điểm phối hợp kém nhất (§9.3).
- **Status:** pending.
- **Mô tả:** 3 việc lễ tân: (1) check-in/queue (số 0-999 hoặc bed_number cấp cứu — giữ khái niệm cũ); (2) scan consent → đóng gate (đủ 4 điều kiện); (3) hàng đợi recall/follow_up order (route từ engine khi procedure đóng).

## Key Insights
- Consent là **gate order con** route tới lễ tân; đóng bằng bằng chứng (scan + 4 điều kiện §4.D), KHÔNG e-signature — đính scan giấy ký.
- 4 điều kiện đóng gate (engine Phase 05 kiểm, lễ tân chỉ nhập dữ liệu): scan + procedure_type khớp nhóm (auto từ parent) + signed_date < ngày làm + signer hợp lệ (age<18→guardian). Form phải bắt signer + signed_date.
- Force cấp cứu (nếu bác sĩ chỉ định) → lý do bắt buộc + audit; UI lễ tân có thể hiển thị trạng thái force nhưng không tự force.
- Recall/follow_up order tự sinh khi procedure đóng (Phase 05) → vào hàng đợi lễ tân; đóng bằng "tạo lịch hẹn" (evidence = appointment).
- Giữ atomic queue 0-999 + bed_number (Phase 01 giữ trigger `assign_session_number`).

## Requirements
- FR1: check-in form — chọn/ tạo BN, tạo visit_session (số tự cấp hoặc bed_number nếu cấp cứu), chief_complaint.
- FR2: queue board — danh sách visit đang chờ (pending/called), trạng thái.
- FR3: consent queue — list order_type='consent' status open route lễ tân; form nhập signer + signed_date + upload scan → insert consents + order_evidence(consent_scan) → engine kiểm gate.
- FR4: recall queue — follow_up order treo; đóng bằng tạo lịch hẹn (evidence appointment) hoặc đánh dấu đã liên hệ.
- NFR: i18n vi/en; file <200 dòng.

## Architecture
```
/checkin (receptionist)
 ├─ <CheckinForm>        (patient + session_number/bed_number)
 ├─ <QueueBoard>         (visit pending/called)
 ├─ <ConsentQueue>       (consent gate orders → scan form → close gate)
 │     └─ <ConsentForm>  (signer, signed_date, upload scan)
 └─ <RecallQueue>        (follow_up orders → tạo lịch/đánh dấu)
```
Consent close: insert `consents` (order_id, procedure_type từ parent, scan_path, signer, signed_date) + `order_evidence(evidence_type='consent_scan')` → trg `auto_close_on_evidence` gọi `consent_gate_ok` → đóng gate nếu đủ. UI hiển thị lý do chưa đóng nếu thiếu điều kiện (vd "ngày ký sau ngày làm", "cần chữ ký giám hộ").

## Related Code Files
**Create:**
- `src/components/reception/checkin-form.tsx` (tách từ checkin cũ, rút gọn theo visit_status mới).
- `src/components/reception/queue-board.tsx`
- `src/components/reception/consent-queue.tsx` + `consent-form.tsx`
- `src/components/reception/recall-queue.tsx`
- `src/lib/consent.ts` — submit consent (upload scan + insert consents + evidence) + hiển thị lý do gate chưa đóng.

**Modify:**
- `src/routes/_authenticated/checkin.tsx` — lắp components mới.
- `src/routes/_authenticated/follow-ups.tsx` — repoint sang follow_up orders (hoặc nhúng RecallQueue).
- `src/lib/i18n.tsx` — keys (consent, signer, guardian, signed_date, recall, create_appointment...).

**Read for context:** `assign_session_number`/counters (Phase 01), consent_gate_ok (Phase 05), checkin.tsx hiện tại.

## Implementation Steps
1. `checkin-form.tsx`: tìm/tạo BN (giữ name search), tạo visit_session (is_emergency→bed_number; else số tự cấp). Bỏ ref rounds/procedure/compliance.
2. `queue-board.tsx`: list visit pending/called + realtime.
3. `consent.ts` + `consent-form.tsx`: form signer(patient/guardian) + signed_date(date) + upload scan (`consent-scans`); submit → insert consents + order_evidence; hiển thị kết quả gate (đóng / lý do chưa đóng).
4. `consent-queue.tsx`: list consent gate orders open (route lễ tân) + nút mở ConsentForm.
5. `recall-queue.tsx`: list follow_up orders treo; nút "tạo lịch hẹn" (ghi evidence appointment → auto-close) hoặc "đã liên hệ".
6. Sửa `checkin.tsx` + `follow-ups.tsx`. i18n keys. Build sạch.
7. Test: bác sĩ ban procedure implant + consent gate → gate hiện ở lễ tân → nhập scan + signer hợp lệ → gate đóng; thử signed_date sau ngày làm → gate KHÔNG đóng, hiện lý do.

## Todo List
- [ ] `checkin-form.tsx` + `queue-board.tsx` (visit_status mới)
- [ ] `consent.ts` + `consent-form.tsx` (scan + signer + signed_date)
- [ ] `consent-queue.tsx`
- [ ] `recall-queue.tsx` (follow_up orders)
- [ ] Sửa `checkin.tsx` + `follow-ups.tsx`
- [ ] i18n keys + build sạch
- [ ] Test gate đóng/không đóng (timing + signer)

## Success Criteria
- Consent gate implant hiện ở lễ tân; nhập scan + signer hợp lệ → gate tự đóng.
- signed_date sau ngày làm HOẶC BN<18 mà signer=patient → gate KHÔNG đóng + hiện lý do.
- Recall order xuất hiện sau khi procedure đóng; tạo lịch → recall đóng.
- Queue 0-999/bed_number hoạt động. Build sạch.

## Risk Assessment
- **Lễ tân không hiểu vì sao gate chưa đóng** → UI hiển thị rõ điều kiện thiếu (map từ consent_gate_ok).
- **Age check thiếu dob** → yêu cầu dob khi tạo BN hoặc cảnh báo review tay.

## Security Considerations
- `consent-scans` bucket private, RLS is_staff, signed URL.
- Không cho lễ tân tự force gate (force chỉ do bác sĩ, audit).

## Next Steps
- Phase 10 dashboard quản lý (vi phạm treo, gồm consent gate mở).
