-- Phase 01 (EMR Observations, part 2) — labs/vitals curated vào Customer Graph.
-- KB whitelist định nghĩa cái gì đáng quan tâm (LOINC) → Graph truy xuất SỰ THẬT (value+ngày+ref).
-- KHÔNG phán "bất thường". Retrieval-not-inference. RLS staff-read (PII). Seed Synthea (source='synthea').
-- Mã whitelist ĐÃ VERIFY có thật trong observations.csv (INR 4465 dòng, HbA1c 92k, HA 167k, ...).

-- ---------- KB layer: whitelist quan sát liên quan nha ----------
CREATE TABLE public.emr_observation_whitelist (
  loinc_code   text PRIMARY KEY,
  label        text,
  label_vi     text,
  category     text,              -- 'bleeding' | 'glycemic' | 'cardiovascular' | 'behavioral' | 'other'
  unit         text,
  ref_low      numeric,           -- ngưỡng lab CHUẨN (kiến thức KB), NULL nếu không áp dụng
  ref_high     numeric,
  related_flag text,              -- nối nka_systemic_flags theo nhóm: 'anticoagulant' | 'diabetes' | NULL
  relevance_vi text,              -- vì sao đáng quan tâm với nha khoa
  active       boolean NOT NULL DEFAULT true
);

-- ---------- Fact layer: giá trị quan sát (Synthea seed + clinic live sau) ----------
CREATE TABLE public.emr_observations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.emr_encounters(id) ON DELETE SET NULL,
  loinc_code   text,
  description  text,
  value_num    numeric,           -- lab số
  value_text   text,              -- lab phân loại (vd tình trạng hút thuốc)
  unit         text,
  observed_at  timestamptz,
  source       text NOT NULL DEFAULT 'synthea'   -- 'synthea' | 'clinic'
);
CREATE INDEX idx_emr_obs_patient        ON public.emr_observations (patient_id);
CREATE INDEX idx_emr_obs_patient_code_t ON public.emr_observations (patient_id, loinc_code, observed_at DESC);

-- ---------- Seed whitelist (11 mã dental-relevant, ref range chuẩn người lớn) ----------
INSERT INTO public.emr_observation_whitelist
  (loinc_code, label, label_vi, category, unit, ref_low, ref_high, related_flag, relevance_vi) VALUES
  ('6301-6',  'INR',                 'INR (chỉ số đông máu)',   'bleeding',       NULL,      0.8,  1.2,  'anticoagulant', 'Nguy cơ chảy máu khi nhổ răng / tiểu phẫu'),
  ('777-3',   'Platelets',           'Tiểu cầu',                'bleeding',       '10^3/µL', 150,   400,  NULL,            'Nguy cơ chảy máu'),
  ('5902-2',  'Prothrombin time',    'PT (thời gian prothrombin)','bleeding',     'giây',    11,    13.5, 'anticoagulant', 'Đông máu — nguy cơ chảy máu'),
  ('3173-2',  'aPTT',                'aPTT',                    'bleeding',       'giây',    25,    35,   'anticoagulant', 'Đông máu — nguy cơ chảy máu'),
  ('4548-4',  'Hemoglobin A1c',      'HbA1c',                   'glycemic',       '%',       NULL,  5.7,  'diabetes',      'Kiểm soát đường huyết — lành thương, nhiễm trùng, implant'),
  ('2339-0',  'Glucose',             'Đường huyết',             'glycemic',       'mg/dL',   70,    100,  'diabetes',      'Đường huyết — lành thương'),
  ('8480-6',  'Systolic BP',         'Huyết áp tâm thu',        'cardiovascular', 'mmHg',    NULL,  120,  NULL,            'Tiền mê có epinephrine'),
  ('8462-4',  'Diastolic BP',        'Huyết áp tâm trương',     'cardiovascular', 'mmHg',    NULL,  80,   NULL,            'Tiền mê có epinephrine'),
  ('72166-2', 'Tobacco smoking status','Tình trạng hút thuốc',  'behavioral',     NULL,      NULL,  NULL, NULL,            'Chống chỉ định tương đối implant / nha chu'),
  ('6690-2',  'Leukocytes (WBC)',    'Bạch cầu (WBC)',          'other',          '10^3/µL', 4,     11,   NULL,            'Dấu hiệu nhiễm trùng'),
  ('38483-4', 'Creatinine',          'Creatinine',              'other',          'mg/dL',   0.6,   1.2,  NULL,            'Chỉnh liều thuốc theo chức năng thận');

-- ---------- Grants + RLS ----------
GRANT SELECT ON public.emr_observation_whitelist TO authenticated;
GRANT SELECT ON public.emr_observations          TO authenticated;
GRANT ALL    ON public.emr_observation_whitelist TO service_role;
GRANT ALL    ON public.emr_observations          TO service_role;

ALTER TABLE public.emr_observation_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emr_observations          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read obs_whitelist"  ON public.emr_observation_whitelist FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write obs_whitelist" ON public.emr_observation_whitelist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff read emr_observations" ON public.emr_observations FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
