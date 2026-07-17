-- Phase 01 (order-centric, ADDITIVE) — 1/4
-- Mở rộng enum procedure_type với các nhóm thủ thuật cần cho scope-match consent + KB rules.
-- ADD VALUE IF NOT EXISTS an toàn (không rebuild type → không phá cột phụ thuộc của model cũ).
-- Tách riêng file này (chạy trước các file dùng value) vì Postgres cấm dùng value vừa ADD trong cùng transaction.

ALTER TYPE public.procedure_type ADD VALUE IF NOT EXISTS 'biopsy';
ALTER TYPE public.procedure_type ADD VALUE IF NOT EXISTS 'bone_graft';
ALTER TYPE public.procedure_type ADD VALUE IF NOT EXISTS 'sinus_lift';
ALTER TYPE public.procedure_type ADD VALUE IF NOT EXISTS 'perio_surgery';
ALTER TYPE public.procedure_type ADD VALUE IF NOT EXISTS 'exam';
ALTER TYPE public.procedure_type ADD VALUE IF NOT EXISTS 'fluoride';
