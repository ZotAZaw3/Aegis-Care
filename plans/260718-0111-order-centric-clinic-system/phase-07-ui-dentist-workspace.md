# Phase 07 — UI Bác sĩ: workspace viết/ký y lệnh [24h-core]

> **Skill:** invoke `/ui-ux-pro-max` cho design system + polish của workspace.

## Context Links
- Brainstorm §4.B (thời khắc viết y lệnh), §9.3 (UI bác sĩ), §10 (luồng ca).
- Deps: `get_safety_panel`/`get_crm_recall` (Phase 03), briefing edge fn (Phase 04), engine (Phase 05), `get_order_drafts` (Phase 06).
- Route hiện tại thay thế: `src/routes/_authenticated/visits.$id.tsx` (dùng rounds/lab_orders/compliance_score cũ — ĐẬP).

## Overview
- **Priority:** P0 — mặt phẳng tương tác cốt lõi; ma sát bác sĩ là sinh tử (§8).
- **Status:** pending.
- **Mô tả:** Workspace 2 cột. **Trái = panel bối cảnh** (chỉ đọc): AN TOÀN (Lane1 hard-query, bất biến) + BỆNH SỬ (briefing LLM có trích dẫn). **Phải = nháp y lệnh** (ghi vào): KB điền sẵn theo thủ thuật, bác sĩ sửa/bỏ/ký. Cộng **hàng đợi "chờ tôi xem"** (kết quả y lệnh về).

## Key Insights
- **Ranh giới sống ở đây (§4.B):** Graph chỉ ĐỌC (panel trái), KB GHI VÀO (nháp phải). CHỈ bác sĩ nối panel với y lệnh — hệ thống không tự ghi.
- **Panel an toàn bất biến giao diện:** dị ứng/thuốc/bệnh nền luôn hiện, KHÔNG thu gọn ẩn, KHÔNG qua LLM. Hạng ① — không tick.
- **Briefing có trích dẫn:** mỗi câu click được về encounter nguồn (chống automation bias). Hiện caveat nếu có câu bị drop.
- **AI draft phải cực tiện** (§8): chọn procedure_type → nháp tự điền → bác sĩ chỉ sửa/ký. Bỏ bước mandatory → modal đòi lý do exception.
- Hàng đợi "chờ tôi xem" KHÔNG ngắt bác sĩ đang làm ca khác (§4.C) — là danh sách pull, không popup.

## Requirements
- FR1: layout 2 cột responsive; cột trái sticky panel bối cảnh.
- FR2: Lane1 SafetyPanel — gọi `get_safety_panel(patient_id)`, hiển thị dị ứng (đỏ) + thuốc active + systemic flags; luôn hiện, không ẩn.
- FR3: BriefingPanel — gọi edge fn `briefing`, render câu + citation chip (click cuộn tới encounter list), loading/skeleton, caveat.
- FR4: OrderDraftPanel — chọn procedure_type → `get_order_drafts`, render nháp; toggle giữ/bỏ; sửa detail/due; bỏ mandatory → modal exception_reason.
- FR5: "Ký & ban" → insert medical_orders (+ consent gate con nếu requires_consent) theo hợp đồng Phase 06; chữ ký = ordered_by = staff hiện tại.
- FR6: PendingReviewQueue — list `pending_review_orders` của bác sĩ (order awaiting_review), xem evidence, "đóng"/ban y lệnh tiếp.
- FR7: tự viết order thủ công (không qua KB) — fallback.
- NFR: mọi label vi/en trong i18n; file <200 dòng (tách component).

## Architecture
```
/visits/$id (dentist)
 ├─ <SafetyPanel patientId>        (Lane1 RPC, luôn hiện)
 ├─ <BriefingPanel patientId>      (edge fn, citations)
 ├─ <OrderDraftPanel session>      (procedure_type → get_order_drafts → sign)
 │     └─ <ExceptionDialog>        (bỏ bước mandatory)
 ├─ <ActiveOrdersList session>     (order của ca này + trạng thái/gate)
 └─ <PendingReviewQueue dentist>   (pending_review_orders)
```
Realtime: subscribe `medical_orders` (ca này) + invalidate query. TanStack Query cho tất cả fetch.

## Related Code Files
**Create:**
- `src/components/dentist/safety-panel.tsx` — Lane1.
- `src/components/dentist/briefing-panel.tsx` — Lane2 + citation chips.
- `src/components/dentist/order-draft-panel.tsx` — KB draft + sign.
- `src/components/dentist/exception-dialog.tsx` — lý do bỏ bước buộc.
- `src/components/dentist/active-orders-list.tsx` — order ca này + gate badge.
- `src/components/dentist/pending-review-queue.tsx` — "chờ tôi xem".
- `src/lib/orders.ts` — helper insert order + consent gate (hợp đồng Phase 06), types.

**Modify:**
- `src/routes/_authenticated/visits.$id.tsx` — viết lại dùng components mới (bỏ rounds/lab/compliance_score).
- `src/lib/i18n.tsx` — thêm keys (order_type, close_mode, safety_panel, briefing, exception, sign_orders, pending_review...).
- `src/components/app-sidebar.tsx` — cập nhật nav nếu cần.
- Xóa `src/components/compliance-ring.tsx` (không còn score) — hoặc để Phase 11 dọn.

**Read for context:** RPC signatures (Phase 03/06), edge fn contract (Phase 04), `src/routes/_authenticated/queue.tsx` (pattern realtime cũ).

## Implementation Steps
1. `orders.ts`: types + `insertSignedOrders(sessionId, drafts, exceptions)` (insert procedure trước, consent gate con sau); `currentStaffId()` (tái dùng pattern visits cũ).
2. `safety-panel.tsx`: `useQuery(get_safety_panel)`; render 3 nhóm; dị ứng severe = badge đỏ nổi bật; empty state "không ghi nhận". Luôn render (không collapse).
3. `briefing-panel.tsx`: `supabase.functions.invoke("briefing", {patient_id})`; render câu + `<CitationChip encounterId>`; skeleton khi load; hiển thị caveat; nút "tải lại".
4. `order-draft-panel.tsx`: select procedure_type (i18n) → `get_order_drafts` → list toggle; bỏ mandatory mở `exception-dialog`; nút "Ký & ban" gọi `insertSignedOrders`, toast, invalidate.
5. `active-orders-list.tsx`: list order ca này; badge trạng thái + gate (consent con mở → "chờ cam kết"); realtime subscribe.
6. `pending-review-queue.tsx`: `pending_review_orders` của bác sĩ; xem evidence (link storage) + nút "đóng/ban tiếp".
7. Viết lại `visits.$id.tsx` lắp 6 component; bỏ mọi ref rounds/lab_orders/compliance_score.
8. Thêm i18n keys vi/en. Chạy build (`npm run build`/`tsc`) fix lỗi type.

## Todo List
- [ ] `orders.ts` helper insert + consent gate
- [ ] `safety-panel.tsx` (Lane1, luôn hiện)
- [ ] `briefing-panel.tsx` (citations + caveat)
- [ ] `order-draft-panel.tsx` + `exception-dialog.tsx`
- [ ] `active-orders-list.tsx` (gate badge, realtime)
- [ ] `pending-review-queue.tsx`
- [ ] Viết lại `visits.$id.tsx`, bỏ rounds/lab/score
- [ ] i18n keys vi/en + build sạch

## Success Criteria
- Mở ca implant: panel an toàn hiện dị ứng/warfarin (nếu có); briefing hiện ≥3 câu có citation click được.
- Chọn "implant" → 5 nháp điền sẵn; bỏ CBCT (mandatory) → buộc nhập lý do; "Ký & ban" tạo order + consent gate con.
- Order thực thi xong hiện ở "chờ tôi xem".
- Build TypeScript sạch; KHÔNG còn import compliance-ring/lab_orders.

## Risk Assessment
- **Ma sát bác sĩ** → draft mặc định + 1 nút ký; tối thiểu số lần gõ. Ưu tiên UX phần này (dùng `/ui-ux-pro-max`).
- **Briefing latency** → skeleton + không chặn thao tác order; panel an toàn (Lane1) load nhanh, độc lập.
- **File >200 dòng** → tách theo component đã liệt kê.

## Security Considerations
- Chỉ role dentist thấy nút ký (UI gate) + `ordered_by` = staff hiện tại. DB vẫn is_staff blanket (khớp convention).
- Không hiển thị key/nội bộ; briefing gọi qua edge fn (key server-side).
- Storage evidence link qua signed URL, không public.

## Next Steps
- Phase 08 trợ thủ thực thi order + upload evidence (đóng vòng về "chờ tôi xem").
- Phase 09 lễ tân scan consent (đóng gate).
