
-- Add the lab technician role ("Nhân viên xét nghiệm" in the patient-visit
-- flow). ALTER TYPE ... ADD VALUE must commit before the new value can be
-- referenced elsewhere (e.g. seed data or policies in a later migration), so
-- it gets its own migration file.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'lab_technician';
