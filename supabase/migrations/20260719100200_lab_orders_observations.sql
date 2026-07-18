-- Phase 05 (EMR Observations) — nhập lâm sàng SỐNG: kết quả lab → emr_observations (source='clinic').
-- Mirror pattern live-graph: lab_orders hoàn tất (completed) VỚI mã whitelist → trigger emit observation.
-- Chỉ cấu trúc hóa khi lab tech chọn mã LOINC + nhập giá trị; lab tự do (không mã) vẫn giữ result_note như cũ.

-- ---------- Thêm trường cấu trúc cho lab_orders (tùy chọn — null nếu lab tự do) ----------
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS loinc_code text,
  ADD COLUMN IF NOT EXISTS value_num  numeric,
  ADD COLUMN IF NOT EXISTS value_text text,
  ADD COLUMN IF NOT EXISTS unit       text;

-- ---------- Trigger: lab completed + có mã → chèn emr_observations(source='clinic') ----------
-- SECURITY DEFINER: ghi emr_observations (client chỉ SELECT). patient_id lấy qua visit_sessions.
CREATE OR REPLACE FUNCTION public.emit_observation_on_lab_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_patient uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.loinc_code IS NOT NULL THEN
    SELECT patient_id INTO v_patient FROM public.visit_sessions WHERE id = NEW.visit_session_id;
    IF v_patient IS NOT NULL THEN
      INSERT INTO public.emr_observations
        (patient_id, encounter_id, loinc_code, description, value_num, value_text, unit, observed_at, source)
      VALUES (
        v_patient, NULL, NEW.loinc_code, NEW.test_name,
        NEW.value_num, NEW.value_text,
        COALESCE(NEW.unit, (SELECT w.unit FROM public.emr_observation_whitelist w WHERE w.loinc_code = NEW.loinc_code)),
        COALESCE(NEW.completed_at, now()), 'clinic'
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Trigger function không gọi trực tiếp bởi client (chuẩn hệ thống).
REVOKE EXECUTE ON FUNCTION public.emit_observation_on_lab_done() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_emit_observation_on_lab_done ON public.lab_orders;
CREATE TRIGGER trg_emit_observation_on_lab_done
  AFTER UPDATE OF status ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.emit_observation_on_lab_done();
