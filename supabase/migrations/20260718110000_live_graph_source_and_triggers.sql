-- Phase B — Customer Graph SỐNG (1/2): cột source + triggers đẩy vận hành vào emr_*.
-- emr_* = bệnh sử canonical, 2 nguồn: 'synthea' (ETL) | 'clinic' (vận hành thật).
-- BN mới không cần ETL vẫn có graph; Lane1 tự thấy thuốc clinic (med_stop NULL).

-- ---------- Cột source + origin link ----------
ALTER TABLE public.emr_encounters
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'synthea' CHECK (source IN ('synthea','clinic')),
  ADD COLUMN IF NOT EXISTS origin_visit_id uuid;
ALTER TABLE public.emr_procedures
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'synthea' CHECK (source IN ('synthea','clinic')),
  ADD COLUMN IF NOT EXISTS origin_order_id uuid;
ALTER TABLE public.emr_medications
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'synthea' CHECK (source IN ('synthea','clinic')),
  ADD COLUMN IF NOT EXISTS origin_order_id uuid;
ALTER TABLE public.emr_conditions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'synthea' CHECK (source IN ('synthea','clinic'));

CREATE INDEX IF NOT EXISTS idx_emr_enc_origin_visit  ON public.emr_encounters (origin_visit_id);
CREATE INDEX IF NOT EXISTS idx_emr_proc_origin_order ON public.emr_procedures (origin_order_id);
CREATE INDEX IF NOT EXISTS idx_emr_med_origin_order  ON public.emr_medications (origin_order_id);

-- ---------- Trigger A: visit done → clinic encounter ----------
CREATE OR REPLACE FUNCTION public.emit_encounter_on_visit_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done'
     AND NOT EXISTS (SELECT 1 FROM public.emr_encounters e WHERE e.origin_visit_id = NEW.id) THEN
    INSERT INTO public.emr_encounters
      (patient_id, source, origin_visit_id, class, description, encounter_start, encounter_stop)
    VALUES (NEW.patient_id, 'clinic', NEW.id, 'ambulatory',
            COALESCE(NULLIF(NEW.chief_complaint, ''), 'Khám nha khoa'),
            NEW.created_at, COALESCE(NEW.closed_at, now()));
    -- Backfill: y lệnh thường đóng TRƯỚC khi ca 'done' → nối lại procedure/medication mồ côi của ca này.
    UPDATE public.emr_procedures p SET encounter_id = e.id
      FROM public.emr_encounters e
      WHERE e.origin_visit_id = NEW.id AND p.encounter_id IS NULL AND p.source = 'clinic'
        AND p.origin_order_id IN (SELECT id FROM public.medical_orders WHERE visit_session_id = NEW.id);
    UPDATE public.emr_medications m SET encounter_id = e.id
      FROM public.emr_encounters e
      WHERE e.origin_visit_id = NEW.id AND m.encounter_id IS NULL AND m.source = 'clinic'
        AND m.origin_order_id IN (SELECT id FROM public.medical_orders WHERE visit_session_id = NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_emit_encounter ON public.visit_sessions;
CREATE TRIGGER trg_emit_encounter AFTER UPDATE ON public.visit_sessions
  FOR EACH ROW EXECUTE FUNCTION public.emit_encounter_on_visit_done();

-- ---------- Trigger B: order procedure/medication đóng → clinic emr row ----------
CREATE OR REPLACE FUNCTION public.emit_emr_on_order_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enc uuid;
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    SELECT id INTO v_enc FROM public.emr_encounters
      WHERE origin_visit_id = NEW.visit_session_id LIMIT 1;  -- link nếu visit đã 'done' (NULL = chấp nhận)
    IF NEW.order_type = 'procedure'
       AND NOT EXISTS (SELECT 1 FROM public.emr_procedures p WHERE p.origin_order_id = NEW.id) THEN
      INSERT INTO public.emr_procedures
        (patient_id, encounter_id, source, origin_order_id, description, performed_at)
      VALUES (NEW.patient_id, v_enc, 'clinic', NEW.id, NEW.title, COALESCE(NEW.closed_at, now()));
    ELSIF NEW.order_type = 'medication'
       AND NOT EXISTS (SELECT 1 FROM public.emr_medications m WHERE m.origin_order_id = NEW.id) THEN
      INSERT INTO public.emr_medications
        (patient_id, encounter_id, source, origin_order_id, description, med_start, med_stop)
      VALUES (NEW.patient_id, v_enc, 'clinic', NEW.id, NEW.title,
              COALESCE(NEW.closed_at, now())::date, NULL);   -- NULL = đang dùng → Lane1 tự thấy
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_emit_emr_order ON public.medical_orders;
CREATE TRIGGER trg_emit_emr_order AFTER UPDATE ON public.medical_orders
  FOR EACH ROW EXECUTE FUNCTION public.emit_emr_on_order_closed();

-- ---------- Convention: trigger fn không cho client gọi ----------
REVOKE EXECUTE ON FUNCTION public.emit_encounter_on_visit_done() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_emr_on_order_closed()     FROM PUBLIC, anon, authenticated;
