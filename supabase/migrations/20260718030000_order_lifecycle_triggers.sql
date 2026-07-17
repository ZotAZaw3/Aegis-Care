-- Phase 05 — Order lifecycle engine (deterministic, KHÔNG score).
-- Views order_violations / pending_review_orders đã tạo ở Phase 01 (kèm red-team fixes A1/A2/A5a).
-- File này: triggers + functions + refresh_alerts RPC.
--
-- Quyết định thiết kế (đã cân theo red-team):
--  * route_order chỉ ĐẶT MẶC ĐỊNH khi thiếu (fill-if-null) → không clobber giá trị KB/recall gửi lên.
--    due_at LUÔN NOT NULL sau route (A1 belt); view case-lifecycle (Phase 01) là net mạnh hơn (A1 suspenders).
--  * block_procedure_close chặn theo CONSENT con (gate pháp lý cứng). Imaging/lab là order ANH EM
--    (cùng visit, không phải con) nên KHÔNG hard-block — để view vi phạm bắt (human-first, tránh over-block).
--  * generate_recall_order là NGUỒN DUY NHẤT của tái khám (tạo lúc procedure đóng, due tính từ lúc đóng).
--    → Phase 06 KHÔNG seed dòng follow_up trong kb_rules (tránh trùng + lệch due — A5e).

-- ============ 1) route_order: BEFORE INSERT (đặt mặc định, không clobber) ============
CREATE OR REPLACE FUNCTION public.route_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'open' THEN
    NEW.status := 'routed';
  END IF;
  -- A1: mọi order có due (không để NULL → không tàng hình trước nhánh overdue)
  IF NEW.due_at IS NULL THEN
    NEW.due_at := NEW.opened_at + CASE NEW.order_type
      WHEN 'follow_up' THEN interval '7 days'
      WHEN 'referral'  THEN interval '48 hours'
      ELSE interval '24 hours'
    END;
  END IF;
  RETURN NEW;
END $$;

-- ============ 2) consent_gate_ok(order_id con): 4 điều kiện (hoặc force) ============
-- A5b: đọc procedure_type từ order con vs cha (consents KHÔNG còn cột procedure_type).
-- A4: signed_date <= parent.opened_at::date (chống ký lùi thật, không dùng now()).
CREATE OR REPLACE FUNCTION public.consent_gate_ok(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_consent  public.consents%ROWTYPE;
  v_child    public.medical_orders%ROWTYPE;
  v_parent   public.medical_orders%ROWTYPE;
  v_dob      date;
  v_age      int;
BEGIN
  -- #5: hàm này chỉ trigger (definer) gọi — REVOKE khỏi client ở cuối file (không grant authenticated),
  --     nên không cần guard auth.uid() ở đây (tránh kẹt khi auth.uid() NULL trong ngữ cảnh definer/editor).
  SELECT * INTO v_child FROM public.medical_orders WHERE id = p_order_id AND order_type = 'consent';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_consent FROM public.consents WHERE order_id = p_order_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Ngoại lệ cấp cứu có audit
  IF v_consent.force_emergency AND v_consent.force_reason IS NOT NULL THEN
    RETURN true;
  END IF;

  SELECT * INTO v_parent FROM public.medical_orders WHERE id = v_child.parent_order_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_consent.scan_path IS NULL THEN RETURN false; END IF;                              -- 1) scan
  IF v_child.procedure_type IS DISTINCT FROM v_parent.procedure_type THEN RETURN false; END IF; -- 2) scope-match nhóm
  -- 3) cửa sổ hợp lệ: ký TỪ ngày ban y lệnh TỚI hôm nay.
  --    Luồng đúng = ban y lệnh → ký → làm, nên consent ký SAU khi mở order là bình thường.
  --    Chặn: consent cũ tái chế (ký trước khi order tồn tại) + ghi ngày tương lai.
  IF v_consent.signed_date IS NULL
     OR v_consent.signed_date < v_parent.opened_at::date
     OR v_consent.signed_date > CURRENT_DATE THEN RETURN false; END IF;

  SELECT dob INTO v_dob FROM public.patients WHERE id = v_child.patient_id;              -- 4) người ký
  IF v_dob IS NULL THEN RETURN false; END IF;   -- thiếu dob → cần review tay, không auto-pass
  v_age := date_part('year', age(v_consent.signed_date, v_dob));
  IF v_age < 18 AND v_consent.signer IS DISTINCT FROM 'guardian' THEN RETURN false; END IF;

  RETURN true;
END $$;

-- ============ 3) auto_close_on_evidence: AFTER INSERT order_evidence ============
CREATE OR REPLACE FUNCTION public.auto_close_on_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o             public.medical_orders%ROWTYPE;
  v_needs_review boolean;
BEGIN
  SELECT * INTO o FROM public.medical_orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF o.status IN ('closed','cancelled') THEN RETURN NEW; END IF;   -- guard re-fire / evidence muộn
  IF o.close_mode <> 'evidence' THEN RETURN NEW; END IF;           -- manual/invariant không auto-close

  IF o.order_type = 'consent' THEN
    IF public.consent_gate_ok(o.id) THEN
      UPDATE public.medical_orders
        SET status='closed', closed_at=now(), closed_by=NEW.submitted_by WHERE id=o.id;
    END IF;
    RETURN NEW;
  END IF;

  -- A2: needs_review từ KB (else imaging/lab mặc định cần bác sĩ xem)
  IF o.kb_rule_id IS NOT NULL THEN
    SELECT needs_review INTO v_needs_review FROM public.kb_rules WHERE id = o.kb_rule_id;
  ELSE
    v_needs_review := o.order_type IN ('imaging','lab');
  END IF;

  IF COALESCE(v_needs_review, false) THEN
    UPDATE public.medical_orders SET status='awaiting_review' WHERE id=o.id;  -- chờ bác sĩ đóng final
  ELSE
    -- #4: nếu là procedure có gate mở, block_procedure_close sẽ RAISE trong UPDATE này.
    -- Nuốt check_violation để KHÔNG rollback cả INSERT order_evidence (giữ bằng chứng, order ở nguyên trạng).
    BEGIN
      UPDATE public.medical_orders
        SET status='closed', closed_at=now(), closed_by=NEW.submitted_by WHERE id=o.id;
    EXCEPTION WHEN check_violation THEN
      NULL;  -- gate/precondition chưa đủ: bằng chứng vẫn được ghi, order chờ xử lý tay
    END;
  END IF;
  RETURN NEW;
END $$;

-- ============ 4) block_procedure_close_if_gate_open: BEFORE UPDATE ============
CREATE OR REPLACE FUNCTION public.block_procedure_close_if_gate_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status <> 'closed' AND NEW.order_type = 'procedure' THEN
    -- (a) consent con còn mở & KHÔNG phải force-có-audit → chặn (#1: mirror đủ điều kiện force của consent_gate_ok)
    IF EXISTS (
      SELECT 1 FROM public.medical_orders c
      LEFT JOIN public.consents cs ON cs.order_id = c.id
      WHERE c.parent_order_id = NEW.id AND c.order_type = 'consent'
        AND c.status <> 'closed'
        AND NOT (COALESCE(cs.force_emergency, false) AND cs.force_reason IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'Không thể đóng thủ thuật khi consent gate chưa đóng. Nạp cam kết hợp lệ hoặc force cấp cứu (có lý do).'
        USING ERRCODE = 'check_violation';
    END IF;
    -- (b) #3: KB buộc consent nhưng KHÔNG tạo gate nào → chặn (chống bỏ qua bằng cách không tạo consent con)
    IF NEW.kb_rule_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.kb_rules k WHERE k.id = NEW.kb_rule_id AND k.requires_consent)
       AND NOT EXISTS (SELECT 1 FROM public.medical_orders c
                       WHERE c.parent_order_id = NEW.id AND c.order_type = 'consent') THEN
      RAISE EXCEPTION 'Thủ thuật này buộc phải có cam kết (consent) nhưng chưa có gate consent nào.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ============ 5) generate_recall_order: AFTER UPDATE (procedure → closed) ============
CREATE OR REPLACE FUNCTION public.generate_recall_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset interval;
BEGIN
  IF NEW.status = 'closed' AND OLD.status <> 'closed' AND NEW.order_type = 'procedure' THEN
    v_offset := CASE NEW.procedure_type WHEN 'root_canal' THEN interval '14 days' ELSE interval '7 days' END;
    INSERT INTO public.medical_orders
      (visit_session_id, patient_id, parent_order_id, order_type, title, assigned_role, status, close_mode, opened_at, due_at, ordered_by)
    VALUES
      (NEW.visit_session_id, NEW.patient_id, NEW.id, 'follow_up',   -- #6: link về procedure sinh ra nó
       'Tái khám sau ' || COALESCE(NEW.title,'thủ thuật'),
       'receptionist', 'open', 'evidence', now(), now() + v_offset, NEW.closed_by);
  END IF;
  RETURN NEW;
END $$;

-- ============ 6) refresh_alerts(): sinh alert cho vi phạm chưa có alert ============
CREATE OR REPLACE FUNCTION public.refresh_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'chỉ staff' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.alerts (severity, message, session_id, target_role, order_id)
  SELECT
    CASE WHEN v.violation_kind = 'procedure_closed_consent_open'
         THEN 'critical'::public.alert_severity ELSE 'warning'::public.alert_severity END,
    'Y lệnh treo: ' || v.title || ' [' || v.violation_kind || ']',
    v.visit_session_id, v.assigned_role, v.id
  FROM public.order_violations v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.alerts a WHERE a.order_id = v.id AND a.dismissed_at IS NULL
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ============ Triggers ============
DROP TRIGGER IF EXISTS trg_route_order      ON public.medical_orders;
DROP TRIGGER IF EXISTS trg_block_proc_close ON public.medical_orders;
DROP TRIGGER IF EXISTS trg_gen_recall       ON public.medical_orders;
DROP TRIGGER IF EXISTS trg_autoclose        ON public.order_evidence;

CREATE TRIGGER trg_route_order      BEFORE INSERT ON public.medical_orders FOR EACH ROW EXECUTE FUNCTION public.route_order();
CREATE TRIGGER trg_block_proc_close BEFORE UPDATE ON public.medical_orders FOR EACH ROW EXECUTE FUNCTION public.block_procedure_close_if_gate_open();
CREATE TRIGGER trg_gen_recall       AFTER  UPDATE ON public.medical_orders FOR EACH ROW EXECUTE FUNCTION public.generate_recall_order();
CREATE TRIGGER trg_autoclose        AFTER  INSERT ON public.order_evidence FOR EACH ROW EXECUTE FUNCTION public.auto_close_on_evidence();

-- ============ Grants: trigger fns không cho client gọi trực tiếp ============
REVOKE EXECUTE ON FUNCTION public.route_order()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_close_on_evidence()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_procedure_close_if_gate_open() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recall_order()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consent_gate_ok(uuid)               FROM PUBLIC, anon, authenticated; -- #5: chỉ trigger gọi
GRANT  EXECUTE ON FUNCTION public.refresh_alerts()                    TO authenticated;
