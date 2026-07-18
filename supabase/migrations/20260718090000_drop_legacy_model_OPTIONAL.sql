-- Phase 11 — DỌN model cũ (rounds/lab/checklist/follow_ups).
--
-- ⚠ OPTIONAL — KHÔNG bắt buộc cho demo. Các bảng này đã chạy song song (additive) và
--   giờ KHÔNG còn code nào tham chiếu (UI đã chuyển hết sang order-centric; my-checklist
--   repoint ở 20260718080000; queue.tsx bỏ visit_exam_rounds). Để nguyên chúng cũng vô hại.
--
-- ⚠ CHỈ APPLY SAU KHI: (1) demo chạy ổn, (2) đã backup DB. Chưa test trên live DB.
--
-- Thứ tự an toàn: gỡ 2 trigger trên visit_sessions TRƯỚC (chúng ghi vào bảng sắp drop và
-- fire khi update visit_sessions.status/procedure_type — quên gỡ sẽ làm vỡ mọi update ca).

-- 1) Trigger + function cũ gắn với bảng sắp drop
DROP TRIGGER IF EXISTS trg_seed_checklist    ON public.visit_sessions;
DROP TRIGGER IF EXISTS trg_generate_followups ON public.visit_sessions;
DROP FUNCTION IF EXISTS public.seed_checklist_on_procedure_set() CASCADE;
DROP FUNCTION IF EXISTS public.generate_followups_on_done() CASCADE;

-- 2) Bảng model cũ (CASCADE gỡ FK/trigger phụ thuộc; alerts.followup_id chỉ mất ràng buộc, giữ cột)
DROP TABLE IF EXISTS public.visit_exam_rounds CASCADE;
DROP TABLE IF EXISTS public.lab_orders        CASCADE;
DROP TABLE IF EXISTS public.checklist_items   CASCADE;
DROP TABLE IF EXISTS public.checklist_rules   CASCADE;
DROP TABLE IF EXISTS public.follow_ups        CASCADE;

-- 3) Type chỉ dùng bởi lab_orders
DROP TYPE IF EXISTS public.lab_order_status;

-- 4) Cột compliance_score (đã bỏ khỏi mọi UI — §9.1 KHÔNG chấm điểm)
ALTER TABLE public.visit_sessions DROP COLUMN IF EXISTS compliance_score;

-- GIỮ LẠI: visit_sessions (+ current_round vẫn hiển thị ở queue), daily_session_counters,
--   assign_session_number, next_daily_session_number, alerts (repoint order_id), patients, staff, emr_*.
