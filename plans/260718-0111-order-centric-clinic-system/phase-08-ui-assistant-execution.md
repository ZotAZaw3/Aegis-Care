# Phase 08 — UI Trợ thủ: hàng đợi thực thi + upload bằng chứng [24h-core]

> **Skill:** invoke `/ui-ux-pro-max` cho polish board/upload.

## Context Links
- Brainstorm §4.C (thực thi + bằng chứng về), §9.3 (trợ thủ), §10.
- Deps: engine auto-close (Phase 05), storage bucket `order-evidence` (Phase 01).
- Route thay thế: `src/routes/_authenticated/queue.tsx` (phần "pending lab orders" cũ — ĐẬP, thay bằng order execution).

## Overview
- **Priority:** P0 — vòng đời y lệnh đóng nhờ bằng chứng do trợ thủ nạp.
- **Status:** pending.
- **Mô tả:** Hàng đợi y lệnh route tới vai `assistant` (imaging/lab). Trợ thủ thực thi → upload bằng chứng (phim→file) → trigger auto-close (Phase 05) → kết quả về "chờ tôi xem" bác sĩ. Hạng ② tự đóng, KHÔNG tick.

## Key Insights
- **Tự đóng bằng bằng chứng (§4.C hạng ②):** trợ thủ KHÔNG tick "đã xong" — họ nạp bằng chứng (file phim), engine tự đóng. Ít tick → tick còn nghĩa.
- Một board gộp cả gọi số (kế thừa vai assistant gọi queue) + thực thi y lệnh — vai assistant kiêm (ARCHITECTURE: không có lab_technician riêng).
- Order `close_mode='manual'` (hiếm) mới có nút tick; `evidence` chỉ có upload.

## Requirements
- FR1: list order `assigned_role='assistant'` status open/routed/in_progress, group theo BN/ca, sort due_at.
- FR2: mỗi order: xem chi tiết (title/detail/patient) + hành động theo close_mode: `evidence`→upload file (imaging bucket) hoặc gắn record; `manual`→nút "đánh dấu xong" (ghi order_evidence manual_tick).
- FR3: upload → insert `order_evidence` (file_path) → engine auto-close → order biến khỏi hàng đợi (realtime).
- FR4: hiển thị order quá hạn (due_at<now) nổi bật (đỏ) — nhắc, không chặn.
- NFR: i18n vi/en; file <200 dòng.

## Architecture
```
/queue (assistant)
 ├─ <QueueCallBoard>          (gọi số — kế thừa, rút gọn theo visit_status mới)
 └─ <OrderExecutionList role=assistant>
       └─ <OrderExecuteCard>  (upload evidence → storage → insert order_evidence)
Realtime: subscribe medical_orders + order_evidence → invalidate.
```
Upload: `supabase.storage.from('order-evidence').upload(path)` → path vào `order_evidence.file_path`. Trigger Phase 05 đóng order.

## Related Code Files
**Create:**
- `src/components/assistant/order-execution-list.tsx`
- `src/components/assistant/order-execute-card.tsx` — upload/tick + evidence preview.
- `src/lib/evidence.ts` — upload helper (storage + insert order_evidence) + signed URL.

**Modify:**
- `src/routes/_authenticated/queue.tsx` — thay phần lab orders bằng OrderExecutionList; cập nhật call board theo visit_status mới.
- `src/lib/i18n.tsx` — keys (execute, upload_evidence, mark_done, overdue...).

**Read for context:** engine auto-close (Phase 05), `queue.tsx` realtime pattern hiện tại, storage bucket RLS (Phase 01).

## Implementation Steps
1. `evidence.ts`: `uploadEvidence(orderId, file, type)` → upload storage path `{orderId}/{filename}` → insert order_evidence → return; `signedUrl(path)`.
2. `order-execute-card.tsx`: hiển thị order; nếu close_mode='evidence' → dropzone/input file (imaging) hoặc "gắn bản ghi" (record note); nếu 'manual' → nút xác nhận (manual_tick). Sau thành công: toast + invalidate.
3. `order-execution-list.tsx`: query order assigned_role='assistant' chưa closed; group + sort due_at; badge overdue; realtime subscribe.
4. Sửa `queue.tsx`: giữ call board (gọi số) nhưng bỏ lab_orders cũ; nhúng OrderExecutionList.
5. i18n keys. Build sạch.
6. Test: bác sĩ ban imaging order (Phase 07) → xuất hiện ở đây → upload phim → order auto-close → về "chờ tôi xem" bác sĩ.

## Todo List
- [ ] `evidence.ts` upload + signed URL
- [ ] `order-execute-card.tsx` (evidence/manual)
- [ ] `order-execution-list.tsx` (group, overdue, realtime)
- [ ] Sửa `queue.tsx` bỏ lab_orders cũ
- [ ] i18n keys + build sạch
- [ ] Test vòng: order → upload → auto-close → review

## Success Criteria
- Order imaging từ bác sĩ hiện ở hàng đợi trợ thủ.
- Upload phim → order tự đóng (không tick) → biến mất khỏi list, về review bác sĩ.
- Order quá hạn hiện đỏ.
- Build sạch; KHÔNG còn ref lab_orders.

## Risk Assessment
- **Upload lỗi/định dạng** → validate size/type, toast lỗi rõ, không insert evidence nếu upload fail.
- **Auto-close không kích** → kiểm trigger Phase 05 (order_evidence AFTER INSERT); log.

## Security Considerations
- Storage RLS `is_staff`; signed URL ngắn hạn, không public.
- File_path không đoán được (prefix orderId UUID).

## Next Steps
- Phase 09 lễ tân đóng gate consent + recall.
