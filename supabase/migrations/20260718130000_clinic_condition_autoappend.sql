-- Phase 01 (Compliance Judge plan) — auto-append chẩn đoán bác sĩ vào Customer Graph.
-- visit done + có diagnosis -> emr_conditions clinic. Gộp vào chính hàm emit_encounter_on_visit_done
-- (mig 110000) để bảo đảm THỨ TỰ: encounter tạo trước, condition nối encounter_id sau (cùng transaction).
-- CREATE OR REPLACE (không sửa migration cũ). Imaging: bỏ qua (scope 24h).

ALTER TABLE public.emr_conditions
  ADD COLUMN IF NOT EXISTS origin_visit_id uuid;
CREATE INDEX IF NOT EXISTS idx_emr_cond_origin_visit ON public.emr_conditions (origin_visit_id);

CREATE OR REPLACE FUNCTION public.emit_encounter_on_visit_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enc uuid;
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done'
     AND NOT EXISTS (SELECT 1 FROM public.emr_encounters e WHERE e.origin_visit_id = NEW.id) THEN
    INSERT INTO public.emr_encounters
      (patient_id, source, origin_visit_id, class, description, encounter_start, encounter_stop)
    VALUES (NEW.patient_id, 'clinic', NEW.id, 'ambulatory',
            COALESCE(NULLIF(NEW.chief_complaint, ''), 'Khám nha khoa'),
            NEW.created_at, COALESCE(NEW.closed_at, now()))
    RETURNING id INTO v_enc;

    -- Backfill: y lệnh thường đóng TRƯỚC khi ca 'done' → nối lại procedure/medication mồ côi của ca này.
    UPDATE public.emr_procedures p SET encounter_id = v_enc
      WHERE p.encounter_id IS NULL AND p.source = 'clinic'
        AND p.origin_order_id IN (SELECT id FROM public.medical_orders WHERE visit_session_id = NEW.id);
    UPDATE public.emr_medications m SET encounter_id = v_enc
      WHERE m.encounter_id IS NULL AND m.source = 'clinic'
        AND m.origin_order_id IN (SELECT id FROM public.medical_orders WHERE visit_session_id = NEW.id);

    -- Append chẩn đoán bác sĩ (visit_sessions.diagnosis) → emr_conditions clinic (code NULL).
    -- Briefing bypass clinic (mig 110100) hiển thị dòng code NULL. Guard NOT EXISTS origin_visit_id.
    IF NULLIF(btrim(NEW.diagnosis), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.emr_conditions c WHERE c.origin_visit_id = NEW.id) THEN
      INSERT INTO public.emr_conditions
        (patient_id, encounter_id, source, origin_visit_id, code, description, onset)
      VALUES (NEW.patient_id, v_enc, 'clinic', NEW.id, NULL, NEW.diagnosis,
              COALESCE(NEW.closed_at, now())::date);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Trigger đã tồn tại (mig 110000) trỏ tới hàm này; REPLACE hàm là đủ, không cần tạo lại trigger.
REVOKE EXECUTE ON FUNCTION public.emit_encounter_on_visit_done() FROM PUBLIC, anon, authenticated;
