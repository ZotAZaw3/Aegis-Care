-- Phase 01 (order-centric, ADDITIVE) — 3/4
-- Bảng emr_* read-only: EMR Synthea (nạp ở Phase 02) để briefing Lane2 + Lane1 truy xuất.
-- Red-team B6: emr_encounters có synthea_encounter_id để nối children bền + re-run reconstruct.
-- KHÔNG realtime (dữ liệu tĩnh). RLS: chỉ staff SELECT (PII bệnh sử — KHÔNG anon).

CREATE TABLE public.emr_patients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  synthea_id text UNIQUE,
  birthdate  date,
  gender     text
);

CREATE TABLE public.emr_encounters (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  synthea_encounter_id text,                       -- B6: nối conditions/procedures.ENCOUNTER
  code                 text,
  description          text,
  class                text,
  encounter_start      timestamptz,
  encounter_stop       timestamptz,
  provider             text,
  organization         text
);

CREATE TABLE public.emr_conditions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.emr_encounters(id) ON DELETE SET NULL,
  code         text,
  description  text,
  onset        date,
  abatement    date
);

CREATE TABLE public.emr_procedures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.emr_encounters(id) ON DELETE SET NULL,
  code         text,
  description  text,
  performed_at timestamptz
);

CREATE TABLE public.emr_medications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.emr_encounters(id) ON DELETE SET NULL,
  code         text,                               -- RxNorm (Lane1 match_rxnorm)
  description  text,
  med_start    date,
  med_stop     date                                -- NULL = đang dùng (active)
);

CREATE TABLE public.emr_allergies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  code        text,
  description text,
  severity    text
);

CREATE TABLE public.emr_imaging_studies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.emr_encounters(id) ON DELETE SET NULL,
  modality     text,
  body_site    text,
  study_date   timestamptz
);

CREATE TABLE public.emr_careplans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.emr_encounters(id) ON DELETE SET NULL,
  code         text,
  description  text,
  cp_start     date,
  cp_stop      date
);

CREATE TABLE public.emr_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.emr_encounters(id) ON DELETE SET NULL,
  code         text,
  description  text,
  device_start date
);

-- Index nối nhanh
CREATE INDEX idx_emr_enc_patient   ON public.emr_encounters (patient_id);
CREATE INDEX idx_emr_enc_synthea   ON public.emr_encounters (synthea_encounter_id);
CREATE INDEX idx_emr_cond_patient  ON public.emr_conditions (patient_id);
CREATE INDEX idx_emr_cond_code     ON public.emr_conditions (code);
CREATE INDEX idx_emr_proc_patient  ON public.emr_procedures (patient_id);
CREATE INDEX idx_emr_med_patient   ON public.emr_medications (patient_id);
CREATE INDEX idx_emr_med_code      ON public.emr_medications (code);
CREATE INDEX idx_emr_allergy_patient ON public.emr_allergies (patient_id);
CREATE INDEX idx_emr_img_patient   ON public.emr_imaging_studies (patient_id);

-- Grants + RLS: staff SELECT-only (dữ liệu tham chiếu, seed bằng service_role)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['emr_patients','emr_encounters','emr_conditions','emr_procedures',
                           'emr_medications','emr_allergies','emr_imaging_studies','emr_careplans','emr_devices']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY "staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));', t);
  END LOOP;
END $$;
