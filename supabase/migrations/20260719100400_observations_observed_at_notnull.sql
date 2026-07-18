-- Phase 02 fix (code-review W1) — emr_observations.observed_at là cột thời gian bắt buộc.
-- get_safety_panel/get_observation_history dùng DISTINCT ON ... ORDER BY observed_at DESC để lấy
-- GIÁ TRỊ MỚI NHẤT. DESC mặc định NULLS FIRST → nếu có dòng observed_at NULL sẽ bị chọn nhầm làm
-- "mới nhất" (hiển thị sai cho bác sĩ). ETL + trigger luôn set observed_at nên không có NULL hiện tại;
-- SET NOT NULL gỡ lỗi tiềm ẩn tận gốc (đồng thời khiến NULLS ordering thành vô nghĩa — an toàn).
ALTER TABLE public.emr_observations ALTER COLUMN observed_at SET NOT NULL;
