-- Quickfix (đề bài VAIC): 2 bước tiền-điều trị đề bài nêu tên rõ mà KB chưa có step riêng —
-- "vital sign measurements" + "sterilization and infection control protocols". Tái dùng
-- engine kb_rules sẵn có (KHÔNG thêm order_type/bảng mới): order_type='procedure' (định tuyến
-- vào phòng 'treatment' qua dept_id_for_order_type), assigned_role='assistant', tick tay.
-- sort_order âm → luôn xếp trước các bước imaging/procedure hiện có (sort_order 1,2,3…)
-- mà KHÔNG cần sửa sort_order của các dòng đã seed.
-- Additive + idempotent: DELETE theo title rồi INSERT lại.

DELETE FROM public.kb_rules
WHERE title IN ('Vital signs check', 'Sterilization check')
  AND procedure_type IN ('implant','extraction','root_canal','scaling','filling','biopsy');

INSERT INTO public.kb_rules
  (procedure_type, order_type, title, title_vi, detail, assigned_role, mandatory,
   requires_consent, needs_review, close_mode, evidence_type,
   completion_criteria, completion_criteria_vi, sort_order, department_id)
VALUES
  -- Vital signs check (sort_order -2 → luôn là bước đầu tiên)
  ('implant',    'procedure', 'Vital signs check', 'Đo sinh hiệu trước điều trị',
   'Đo huyết áp/mạch/nhiệt độ trước khi bắt đầu thủ thuật.', 'assistant', true, false, false,
   'manual', 'manual_tick',
   'Vital signs measured and recorded before treatment.',
   'Đã đo và ghi nhận sinh hiệu (huyết áp/mạch/nhiệt độ) trước điều trị.', -2,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('extraction', 'procedure', 'Vital signs check', 'Đo sinh hiệu trước điều trị',
   'Đo huyết áp/mạch/nhiệt độ trước khi bắt đầu thủ thuật.', 'assistant', true, false, false,
   'manual', 'manual_tick',
   'Vital signs measured and recorded before treatment.',
   'Đã đo và ghi nhận sinh hiệu (huyết áp/mạch/nhiệt độ) trước điều trị.', -2,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('root_canal', 'procedure', 'Vital signs check', 'Đo sinh hiệu trước điều trị',
   'Đo huyết áp/mạch/nhiệt độ trước khi bắt đầu thủ thuật.', 'assistant', true, false, false,
   'manual', 'manual_tick',
   'Vital signs measured and recorded before treatment.',
   'Đã đo và ghi nhận sinh hiệu (huyết áp/mạch/nhiệt độ) trước điều trị.', -2,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('scaling',    'procedure', 'Vital signs check', 'Đo sinh hiệu trước điều trị',
   'Đo huyết áp/mạch/nhiệt độ trước khi bắt đầu thủ thuật.', 'assistant', true, false, false,
   'manual', 'manual_tick',
   'Vital signs measured and recorded before treatment.',
   'Đã đo và ghi nhận sinh hiệu (huyết áp/mạch/nhiệt độ) trước điều trị.', -2,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('filling',    'procedure', 'Vital signs check', 'Đo sinh hiệu trước điều trị',
   'Đo huyết áp/mạch/nhiệt độ trước khi bắt đầu thủ thuật.', 'assistant', true, false, false,
   'manual', 'manual_tick',
   'Vital signs measured and recorded before treatment.',
   'Đã đo và ghi nhận sinh hiệu (huyết áp/mạch/nhiệt độ) trước điều trị.', -2,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('biopsy',     'procedure', 'Vital signs check', 'Đo sinh hiệu trước điều trị',
   'Đo huyết áp/mạch/nhiệt độ trước khi bắt đầu thủ thuật.', 'assistant', true, false, false,
   'manual', 'manual_tick',
   'Vital signs measured and recorded before treatment.',
   'Đã đo và ghi nhận sinh hiệu (huyết áp/mạch/nhiệt độ) trước điều trị.', -2,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  -- Sterilization check (sort_order -1 → bước thứ hai, trước imaging/procedure chính)
  ('implant',    'procedure', 'Sterilization check', 'Kiểm tra tiệt trùng dụng cụ',
   'Xác nhận dụng cụ và khu vực làm việc đạt chuẩn tiệt trùng/kiểm soát nhiễm khuẩn trước khi bắt đầu.',
   'assistant', true, false, false, 'manual', 'manual_tick',
   'Instruments and work area confirmed sterile before starting.',
   'Đã xác nhận dụng cụ/khu vực đạt chuẩn tiệt trùng trước khi bắt đầu.', -1,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('extraction', 'procedure', 'Sterilization check', 'Kiểm tra tiệt trùng dụng cụ',
   'Xác nhận dụng cụ và khu vực làm việc đạt chuẩn tiệt trùng/kiểm soát nhiễm khuẩn trước khi bắt đầu.',
   'assistant', true, false, false, 'manual', 'manual_tick',
   'Instruments and work area confirmed sterile before starting.',
   'Đã xác nhận dụng cụ/khu vực đạt chuẩn tiệt trùng trước khi bắt đầu.', -1,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('root_canal', 'procedure', 'Sterilization check', 'Kiểm tra tiệt trùng dụng cụ',
   'Xác nhận dụng cụ và khu vực làm việc đạt chuẩn tiệt trùng/kiểm soát nhiễm khuẩn trước khi bắt đầu.',
   'assistant', true, false, false, 'manual', 'manual_tick',
   'Instruments and work area confirmed sterile before starting.',
   'Đã xác nhận dụng cụ/khu vực đạt chuẩn tiệt trùng trước khi bắt đầu.', -1,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('scaling',    'procedure', 'Sterilization check', 'Kiểm tra tiệt trùng dụng cụ',
   'Xác nhận dụng cụ và khu vực làm việc đạt chuẩn tiệt trùng/kiểm soát nhiễm khuẩn trước khi bắt đầu.',
   'assistant', true, false, false, 'manual', 'manual_tick',
   'Instruments and work area confirmed sterile before starting.',
   'Đã xác nhận dụng cụ/khu vực đạt chuẩn tiệt trùng trước khi bắt đầu.', -1,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('filling',    'procedure', 'Sterilization check', 'Kiểm tra tiệt trùng dụng cụ',
   'Xác nhận dụng cụ và khu vực làm việc đạt chuẩn tiệt trùng/kiểm soát nhiễm khuẩn trước khi bắt đầu.',
   'assistant', true, false, false, 'manual', 'manual_tick',
   'Instruments and work area confirmed sterile before starting.',
   'Đã xác nhận dụng cụ/khu vực đạt chuẩn tiệt trùng trước khi bắt đầu.', -1,
   (SELECT id FROM public.departments WHERE code = 'treatment')),
  ('biopsy',     'procedure', 'Sterilization check', 'Kiểm tra tiệt trùng dụng cụ',
   'Xác nhận dụng cụ và khu vực làm việc đạt chuẩn tiệt trùng/kiểm soát nhiễm khuẩn trước khi bắt đầu.',
   'assistant', true, false, false, 'manual', 'manual_tick',
   'Instruments and work area confirmed sterile before starting.',
   'Đã xác nhận dụng cụ/khu vực đạt chuẩn tiệt trùng trước khi bắt đầu.', -1,
   (SELECT id FROM public.departments WHERE code = 'treatment'));
