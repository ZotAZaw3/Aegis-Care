# Phase 05 — Order lifecycle engine + violations [24h-core]

## ⚠ RED-TEAM FIXES — BẮT BUỘC (xem reports/red-team-260718.md)
- **A1 (CRITICAL) — due_at NULL phá engine:** seed để due NULL cho MỌI procedure/consent/medication → `NULL < now()` không bao giờ match → 13/16 bước vô hình. Sửa **cả hai**: (a) `route_order` set due mặc định NOT NULL (procedure/consent = trước khi ca đóng; medication = trong ngày); (b) **nhánh view case-lifecycle**: order còn open/routed/in_progress/awaiting_review khi `visit_sessions.status='done'` → vi phạm BẤT KỂ due_at. Đây là cách buộc "treo" vào vòng đời ca, mạnh hơn dựa due.
- **A2 (CRITICAL) — awaiting_review + needs_review:** dùng `kb_rules.needs_review` (đã thêm cột ở Phase 01). Chốt trạng thái cuối: thực thi xong → `awaiting_review` (CHƯA closed), bác sĩ đóng final → `closed`. `awaiting_review` PHẢI nằm trong view vi phạm (kẻo kết quả "chờ tôi xem" bị bỏ đói vô hình).
- **A3 (HIGH) — khép 3 đường thoát:** (a) hủy order đòi `cancel_reason` + audit, cấm hủy im lặng bước mandatory; (b) procedure close đòi ≥1 artifact (operative note) — không tick trần; mở `block_procedure_close` chặn cả khi order con mandatory (imaging/medication) chưa đóng, KHÔNG chỉ consent; (c) view "completeness": đối chiếu `kb_rules WHERE mandatory` của procedure_type ca vs order thực có → thiếu = vi phạm (bắt "quên tạo order").
- **A4 (HIGH) — cửa sổ ký hợp lệ:** ⚠ ĐÃ SỬA HƯỚNG (code-review bắt: `<= opened_at` là SAI — luồng đúng là ban y lệnh → ký → làm, nên consent ký SAU khi mở order mới bình thường, vd implant order viết ở buổi tư vấn, ký ngày mổ). Đúng: `p.opened_at::date <= c.signed_date <= CURRENT_DATE` (chặn consent cũ tái chế + ghi ngày tương lai). Upper bound "trước khi làm" đã được đảm bảo cấu trúc bởi `block_procedure_close` (không đóng procedure khi gate mở).
- **A5 (MEDIUM):** (a) view nhánh consent thêm `AND force_emergency=false` (kẻo cấp cứu hợp lệ = vi phạm vĩnh viễn); (c) follow_up đóng = **visit con created** (bệnh nhân đến), không phải đặt-lịch; tách no-show có due gia hạn, không đổ lỗi lễ tân; (d) `exception_reason`/`cancel_reason` CHECK độ dài + reason-code; (e) đồng bộ due recall giữa seed KB (7d) và `generate_recall_order` (1+7+30d).

## Context Links
- Brainstorm §4.C (vòng đời + 3 hạng đóng), §4.D (consent gate), §9.1 (bỏ score, danh sách vi phạm treo), §10 (luồng một ca).
- Bảng: `medical_orders`, `order_evidence`, `consents`, `alerts`, views (Phase 01).

## Overview
- **Priority:** P0 — engine deterministic là "compliance miễn phí".
- **Status:** pending.
- **Mô tả:** Logic Postgres cho vòng đời y lệnh: ban (OPEN) → route đúng vai → thực thi → bằng chứng về → **tự đóng** → kết quả vào hàng đợi "chờ tôi xem" của bác sĩ. Nhánh lỗi: quá hạn còn OPEN = VI PHẠM (query). Consent gate chặn procedure. KHÔNG số điểm.

## Key Insights
- 3 hạng đóng (`close_mode`): ① `invariant` (dị ứng/tiệt trùng — bất biến giao diện, không tick, xử lý ở UI Phase 07/08 + Lane1); ② `evidence` (phim→file, tái khám→lịch, consent→scan, đơn→bản ghi — tự đóng, KHÔNG ai tick); ③ `manual` (tick tay, tối thiểu).
- **Tự đóng bằng bằng chứng:** trigger trên `order_evidence` INSERT — nếu order `close_mode='evidence'` và bằng chứng thỏa → set `status='closed'` + đẩy về awaiting_review của bác sĩ (KHÔNG ngắt bác sĩ đang làm ca khác).
- **Consent gate (§4.D):** consent = order con (`parent_order_id`). Đóng khi ĐỦ 4: scan + khớp `procedure_type` nhóm + `signed_date` < ngày làm + đúng người ký (age<18 → guardian). Gate mở → procedure cha KHÔNG được set closed (raise exception) trừ khi `force_emergency` + `force_reason` (audit).
- **Vi phạm = query, KHÔNG lưu score** (§9.1): view `order_violations`. Danh sách per-case treo, đếm được, khó gian hơn con số. TỪ CHỐI chấm người/điểm.
- Alert sinh khi order quá hạn (deterministic) — 3/4 vấn đề (bỏ bước/thiếu hồ sơ/quên tái khám/mất referral) cùng một truy vấn.

## Requirements
- FR1: trigger `route_order` (BEFORE INSERT) — set `assigned_role` từ `order_type`/`kb_rule`, set `due_at` nếu KB có offset, `status='routed'`.
- FR2: trigger `auto_close_on_evidence` (AFTER INSERT order_evidence) — kiểm `close_mode='evidence'` + điều kiện theo `order_type`; nếu consent → gọi predicate 4-điều-kiện; set closed + result về bác sĩ.
- FR3: hàm `consent_gate_ok(order_id)` — trả bool theo 4 điều kiện.
- FR4: trigger `block_procedure_close_if_gate_open` (BEFORE UPDATE medical_orders) — chặn procedure→closed khi consent con mở (trừ force).
- FR5: hàm/trigger `raise_overdue_alerts()` (chạy định kỳ hoặc on-read) — sinh alert cho order quá hạn OPEN.
- FR6: trigger `generate_recall_order` — khi procedure order đóng, sinh follow_up order (route lễ tân) theo KB.
- FR7: view `order_violations` + `pending_review_orders` (đã khung ở Phase 01, hoàn thiện).

## Architecture
```
INSERT order (OPEN) ──trg route_order──> assigned_role + due_at + 'routed'
    │
người thực thi (Phase 08) upload evidence ──trg auto_close_on_evidence──>
    │   close_mode='evidence' & điều kiện thỏa → status='closed', về awaiting_review bác sĩ
    │   nếu consent: consent_gate_ok() = scan ∧ scope-match ∧ timing ∧ signer
    ▼
procedure cha set 'closed' ──trg block_procedure_close_if_gate_open──>
    consent con chưa closed & KHÔNG force → RAISE EXCEPTION
procedure closed ──trg generate_recall_order──> follow_up order (lễ tân)

Vi phạm (deterministic):
  order_violations VIEW = (open/routed/in_progress ∧ due_at<now)  ∪  (procedure closed ∧ consent con open)
  raise_overdue_alerts() INSERT alerts cho các dòng chưa có alert
```

### `consent_gate_ok(order_id)` — 4 điều kiện (sketch)
```sql
-- c = consents row của order (con); p = parent procedure order
scan_path IS NOT NULL
AND c.procedure_type = p.procedure_type                     -- khớp NHÓM
AND c.signed_date < COALESCE(<ngày làm procedure>, now())   -- chống ký lùi
AND ( date_part('year', age(c.signed_date, pat.dob)) >= 18   -- người ký hợp lệ
      OR c.signer = 'guardian' )
-- HOẶC c.force_emergency = true AND c.force_reason IS NOT NULL  (ngoại lệ có audit)
```

## Related Code Files
**Create:**
- Migration `20260718030000_order_lifecycle_triggers.sql` — route_order, auto_close_on_evidence, consent_gate_ok, block_procedure_close, generate_recall_order, raise_overdue_alerts + REVOKE EXECUTE trên trigger fns.
- Migration `20260718030100_order_views.sql` — hoàn thiện `order_violations`, `pending_review_orders`.

**Modify:** `src/integrations/supabase/types.ts` — regenerate.

**Read for context:** Phase 01 schema (medical_orders/consents/order_evidence/alerts).

## Implementation Steps
1. `route_order` BEFORE INSERT: nếu `kb_rule_id` set → lấy `assigned_role`/`due_offset_hours`/`close_mode` từ kb_rules; else default theo order_type (imaging/lab→assistant, procedure→dentist, follow_up/referral→receptionist, medication→dentist, consent→receptionist). Set `due_at = opened_at + offset`. Set `status='routed'`.
2. `consent_gate_ok(order_id)` STABLE: join consents + parent order + patient dob; trả bool theo 4 điều kiện (hoặc force).
3. `auto_close_on_evidence` AFTER INSERT order_evidence: load order; nếu `close_mode<>'evidence'` return. Nếu `order_type='consent'` → chỉ đóng khi `consent_gate_ok`. Ngược lại (imaging/follow_up/medication...) đủ evidence → đóng. Khi đóng: `status='closed'`, `closed_at=now`, và với order không phải consent → đẩy về awaiting_review (set field/insert vào pending_review qua status='awaiting_review' cho order cần bác sĩ xem; hoặc order tự closed + xuất hiện ở `pending_review_orders`). Chốt: order thực thi xong → `awaiting_review` (bác sĩ xem) → bác sĩ đóng final; hoặc `closed` trực tiếp nếu không cần review. Dùng cột KB `needs_review` (thêm nếu cần) — mặc định imaging/lab cần review, consent/follow_up không.
4. `block_procedure_close_if_gate_open` BEFORE UPDATE: nếu NEW.status='closed' và order_type='procedure' và tồn tại consent con chưa closed và không force → RAISE EXCEPTION (mã check_violation) với message rõ.
5. `generate_recall_order` AFTER UPDATE (procedure→closed): INSERT follow_up order route lễ tân, due theo procedure_type (extraction 1+7d, implant 1+7+30d, root_canal 3+14d, scaling/filling 7d — kế thừa `generate_followups_on_done` cũ nhưng dưới dạng order).
6. `raise_overdue_alerts()`: INSERT alerts (severity theo order_type) cho dòng `order_violations` chưa có alert (chống trùng bằng NOT EXISTS trên alerts.order_id). Trigger gọi khi read (RPC) hoặc cron; cho 24h: RPC `refresh_alerts()` gọi từ dashboard/queue load.
7. Hoàn thiện view `order_violations` (2 nhánh) + `pending_review_orders` (status='awaiting_review', group theo assigned_dentist).
8. REVOKE EXECUTE trigger fns khỏi authenticated/anon; GRANT `refresh_alerts`/`consent_gate_ok` nếu client cần.
9. Test luồng: tạo procedure implant + consent con → thử đóng procedure khi gate mở (phải fail) → nạp consent hợp lệ → auto-close gate → đóng procedure (pass). Tạo order quá hạn → `order_violations` có dòng → `refresh_alerts` sinh alert.

## Todo List
- [ ] `route_order` BEFORE INSERT (assigned_role + due_at)
- [ ] `consent_gate_ok()` 4 điều kiện + force
- [ ] `auto_close_on_evidence` (evidence → closed/awaiting_review)
- [ ] `block_procedure_close_if_gate_open` (RAISE khi gate mở)
- [ ] `generate_recall_order` (procedure closed → follow_up lễ tân)
- [ ] `raise_overdue_alerts()` + `refresh_alerts()` RPC
- [ ] Views `order_violations`, `pending_review_orders`
- [ ] REVOKE trigger fns; test luồng consent + overdue

## Success Criteria
- Đóng procedure khi consent gate mở → lỗi (không đóng được).
- Nạp consent đủ 4 điều kiện → gate tự đóng, KHÔNG tick.
- Order quá hạn OPEN xuất hiện trong `order_violations` + sinh 1 alert (không trùng).
- Procedure đóng → follow_up order tự tạo route lễ tân.
- KHÔNG có cột/hàm nào tính score.

## Risk Assessment
- **Trigger đệ quy / vòng lặp** → tách BEFORE vs AFTER rõ; auto_close không update lại chính bảng gây re-fire vô hạn (guard bằng điều kiện status).
- **Signer age tính sai** → dùng `age(signed_date, dob)`; nếu thiếu dob → coi như cần review tay (không auto-pass).
- **Alert trùng** → NOT EXISTS trên alerts.order_id + violation_kind.

## Security Considerations
- Force cấp cứu BẮT BUỘC `force_reason` (CHECK/trigger) + lưu audit (ordered_by/timestamp) — không cho force im lặng.
- Trigger fns SECURITY DEFINER + search_path; REVOKE EXECUTE khỏi client.
- Không cho client tự set status='closed' vượt gate (trigger chặn ở DB, không chỉ UI).

## Next Steps
- Phase 06 seed kb_rules để route_order/draft có dữ liệu.
- Phase 08 upload evidence kích auto-close. Phase 10 hiển thị `order_violations`.
