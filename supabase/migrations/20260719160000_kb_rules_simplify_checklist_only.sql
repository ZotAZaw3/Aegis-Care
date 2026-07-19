-- Đơn giản hoá order draft panel theo yêu cầu: chỉ còn 2 dòng checklist
-- ("Vital signs check" / "Sterilization check"), bỏ toàn bộ các bước KB khác
-- (X-quang, thủ thuật chính, thuốc, consent...) cho mọi procedure_type.
-- Dùng active=false thay vì DELETE — additive/reversible, khớp pattern seed cũ
-- (get_order_drafts đã lọc WHERE k.active nên dòng inactive tự biến mất khỏi draft).
-- 2 dòng còn lại chuyển mandatory=false: bỏ theo yêu cầu "bỏ modal lí do untick" —
-- Compliance Judge (missing_mandatory ở deterministic.ts) chỉ xét rule mandatory=true,
-- nên tắt mandatory ở đây là điều kiện BẮT BUỘC để ack-reason modal (ComplianceJudgeDialog)
-- không còn bị ép hiện khi 2 dòng này để mặc định untick.

UPDATE public.kb_rules
  SET active = false
  WHERE title NOT IN ('Vital signs check', 'Sterilization check');

UPDATE public.kb_rules
  SET mandatory = false
  WHERE title IN ('Vital signs check', 'Sterilization check');
