-- Phase 06 — KB draft engine (rule engine, KHÔNG LLM).
-- Seed kb_rules theo procedure_type + RPC get_order_drafts.
-- Quyết định (khớp Phase 05):
--  * KHÔNG seed dòng follow_up — tái khám do trigger generate_recall_order sinh (tránh trùng/lệch due).
--  * Consent KHÔNG là row riêng — spawn từ requires_consent trên row procedure (consent order cần parent_order_id).
--  * needs_review: imaging = true (bác sĩ xem phim rồi đóng); còn lại = false.

-- Seed idempotent: xoá seed cũ theo procedure_type rồi nạp lại.
DELETE FROM public.kb_rules
WHERE procedure_type IN ('implant','extraction','root_canal','scaling','filling','biopsy');

INSERT INTO public.kb_rules
  (procedure_type, order_type, title, title_vi, detail, assigned_role, mandatory, requires_consent, needs_review, close_mode, due_offset_hours, sort_order)
VALUES
  -- implant
  ('implant','imaging',   'Chụp CBCT trước cấy',  'Chụp CBCT trước cấy',  'Đánh giá xương/giải phẫu trước cấy trụ', 'assistant', true, false, true,  'evidence', 24, 1),
  ('implant','medication','Kháng sinh dự phòng',  'Kháng sinh dự phòng',  'Theo phác đồ dự phòng nhiễm khuẩn',       'dentist',   true, false, false, 'manual',   NULL, 2),
  ('implant','procedure', 'Cấy trụ implant',      'Cấy trụ implant',      'Thủ thuật chính — cần cam kết',           'dentist',   true, true,  false, 'manual',   NULL, 3),
  -- extraction
  ('extraction','imaging',  'Chụp X-quang',       'Chụp X-quang',         'X-quang trước nhổ',                       'assistant', true, false, true,  'evidence', NULL, 1),
  ('extraction','procedure','Nhổ răng',           'Nhổ răng',             'Thủ thuật chính — cần cam kết',           'dentist',   true, true,  false, 'manual',   NULL, 2),
  -- root_canal
  ('root_canal','imaging',  'X-quang chóp',       'X-quang chóp',         'X-quang chóp răng trước nội nha',         'assistant', true, false, true,  'evidence', NULL, 1),
  ('root_canal','procedure','Điều trị tủy',       'Điều trị tủy',         'Nội nha — cần cam kết',                   'dentist',   true, true,  false, 'manual',   NULL, 2),
  -- scaling (không cần consent)
  ('scaling','procedure',   'Cạo vôi',            'Cạo vôi răng',         'Vệ sinh, không cần cam kết',              'dentist',   true, false, false, 'manual',   NULL, 1),
  -- filling (không cần consent)
  ('filling','procedure',   'Trám răng',          'Trám răng',            'Phục hồi, không cần cam kết',             'dentist',   true, false, false, 'manual',   NULL, 1),
  -- biopsy
  ('biopsy','procedure',    'Sinh thiết',         'Sinh thiết',           'Lấy mẫu mô — cần cam kết',                'dentist',   true, true,  false, 'manual',   NULL, 1);

-- RPC get_order_drafts: trả mảng nháp y lệnh theo procedure_type (SECURITY INVOKER → RLS staff-read của kb_rules áp dụng).
-- Consent phái sinh từ requires_consent (Phase 07 tạo consent gate con khi ký), KHÔNG nằm trong mảng này.
CREATE OR REPLACE FUNCTION public.get_order_drafts(p_procedure_type public.procedure_type)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(k) ORDER BY k.sort_order), '[]'::jsonb)
  FROM public.kb_rules k
  WHERE k.procedure_type = p_procedure_type AND k.active;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_drafts(public.procedure_type) TO authenticated;
