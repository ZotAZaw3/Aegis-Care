-- Phase 03 addendum — bổ sung nka_systemic_flags (red-team B2: phủ đủ hoạt chất).
-- Phát hiện khi test BN 28db9679: đang dùng 4 thuốc kháng đông/kháng tiểu cầu nhưng seed
-- ban đầu chỉ bắt warfarin + clopidogrel — sót aspirin + prasugrel (chảy máu khi nhổ răng).
-- Additive, idempotent theo match_value.

INSERT INTO public.nka_systemic_flags (label, label_vi, match_kind, match_value, severity_hint)
SELECT * FROM (VALUES
  ('Antiplatelet: aspirin',      'Kháng tiểu cầu: aspirin',      'medication_keyword', 'aspirin',      'high'),
  ('Antiplatelet: prasugrel',    'Kháng tiểu cầu: prasugrel',    'medication_keyword', 'prasugrel',    'high'),
  ('Antiplatelet: dipyridamole', 'Kháng tiểu cầu: dipyridamole', 'medication_keyword', 'dipyridamole', 'high'),
  ('Antiplatelet: cilostazol',   'Kháng tiểu cầu: cilostazol',   'medication_keyword', 'cilostazol',   'high'),
  ('Anticoagulant: heparin',     'Chống đông: heparin',          'medication_keyword', 'heparin',      'high'),
  ('Anticoagulant: dalteparin',  'Chống đông: dalteparin',       'medication_keyword', 'dalteparin',   'high'),
  ('Anticoagulant: tinzaparin',  'Chống đông: tinzaparin',       'medication_keyword', 'tinzaparin',   'high'),
  ('Anticoagulant: fondaparinux','Chống đông: fondaparinux',     'medication_keyword', 'fondaparinux', 'high')
) v(label, label_vi, match_kind, match_value, severity_hint)
WHERE NOT EXISTS (
  SELECT 1 FROM public.nka_systemic_flags nf WHERE nf.match_value = v.match_value
);
