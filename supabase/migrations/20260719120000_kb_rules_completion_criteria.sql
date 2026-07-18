-- Làm rõ "y lệnh được tick/đóng khi nào": kb_rules khai báo evidence_type (loại bằng chứng
-- đóng lệnh) + completion_criteria (tiêu chí hoàn thành, người đọc & tự đánh giá).
-- Bằng chứng = đính kèm/tick thủ công (KHÔNG OCR, KHÔNG máy phán "đạt"). Denorm sang
-- medical_orders để hàng đợi thực thi + màn review hiển thị trực tiếp (query select * lấy luôn).
-- ADDITIVE + idempotent: chỉ ADD COLUMN IF NOT EXISTS + UPDATE backfill khi còn NULL.

-- ---------- 1) kb_rules: khai báo bằng chứng + tiêu chí hoàn thành ----------
ALTER TABLE public.kb_rules
  ADD COLUMN IF NOT EXISTS evidence_type          public.evidence_type,
  ADD COLUMN IF NOT EXISTS completion_criteria    text,   -- EN
  ADD COLUMN IF NOT EXISTS completion_criteria_vi text;   -- VI

-- ---------- 2) medical_orders: denorm để hiển thị (populate lúc ký) ----------
ALTER TABLE public.medical_orders
  ADD COLUMN IF NOT EXISTS evidence_type          public.evidence_type,
  ADD COLUMN IF NOT EXISTS completion_criteria_vi text;

-- ---------- 3) Backfill kb_rules (DRY theo order_type; chỉ khi còn trống) ----------
-- evidence_type: close_mode='evidence' → tải tệp; còn lại → tick thủ công.
UPDATE public.kb_rules
  SET evidence_type = CASE WHEN close_mode = 'evidence'
                           THEN 'file_upload'::public.evidence_type
                           ELSE 'manual_tick'::public.evidence_type END
  WHERE evidence_type IS NULL;

-- imaging/lab: tải phim/kết quả → bác sĩ đọc & xác nhận (needs_review).
UPDATE public.kb_rules
  SET completion_criteria_vi = 'Đã tải ảnh chụp/kết quả; bác sĩ đọc và xác nhận đạt.',
      completion_criteria    = 'Imaging/result uploaded; dentist has read and confirmed.'
  WHERE order_type IN ('imaging','lab') AND completion_criteria_vi IS NULL;

-- medication: kê & cấp theo phác đồ.
UPDATE public.kb_rules
  SET completion_criteria_vi = 'Đã kê và cấp thuốc theo phác đồ.',
      completion_criteria    = 'Medication prescribed and dispensed per protocol.'
  WHERE order_type = 'medication' AND completion_criteria_vi IS NULL;

-- procedure có cam kết: thực hiện + cam kết hợp lệ đã nạp (cổng consent chặn nếu thiếu).
UPDATE public.kb_rules
  SET completion_criteria_vi = 'Đã thực hiện thủ thuật; cam kết hợp lệ đã nạp (bắt buộc trước khi đóng).',
      completion_criteria    = 'Procedure performed; valid consent obtained (required before close).'
  WHERE order_type = 'procedure' AND requires_consent AND completion_criteria_vi IS NULL;

-- procedure không cần cam kết: thực hiện xong → đánh dấu.
UPDATE public.kb_rules
  SET completion_criteria_vi = 'Đã thực hiện thủ thuật; đánh dấu hoàn thành.',
      completion_criteria    = 'Procedure performed; mark complete.'
  WHERE order_type = 'procedure' AND NOT requires_consent AND completion_criteria_vi IS NULL;

-- get_order_drafts dùng to_jsonb(k) → tự trả các cột mới, không cần sửa RPC.
