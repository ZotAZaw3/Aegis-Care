-- P2 — Siết quyền ĐÓNG lệnh theo phòng. Điểm đóng thật = INSERT order_evidence
-- (auto_close_on_evidence rồi đóng order; markManualDone cũng insert trước → gate phủ cả hai).
-- Chỉ nhân viên THUỘC phòng của order mới submit được; override cho dentist/admin (human-first).
-- Gate cứng ở RLS (deterministic). UI chỉ hỗ trợ UX. Migration áp tay qua Supabase SQL Editor.
-- blockedBy: 20260719130000 (cần departments + staff_departments + medical_orders.department_id).

-- ============ 1) helper: caller có thuộc phòng p_dept không ============
CREATE OR REPLACE FUNCTION public.is_in_department(p_user uuid, p_dept uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_departments sd
    JOIN public.staff s ON s.id = sd.staff_id
    WHERE s.user_id = p_user AND sd.department_id = p_dept
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_in_department(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_in_department(uuid, uuid) TO authenticated;

-- ============ 2) siết RLS order_evidence: tách read (blanket) / insert (theo phòng) / update ============
-- Thay policy FOR ALL cũ (is_staff blanket) bằng 3 policy hẹp hơn. KHÔNG có policy DELETE
-- → bằng chứng là audit append-only, không cho xoá (an toàn hơn).
DROP POLICY IF EXISTS "staff manage evidence" ON public.order_evidence;
DROP POLICY IF EXISTS "staff read evidence"    ON public.order_evidence;
DROP POLICY IF EXISTS "dept insert evidence"   ON public.order_evidence;
DROP POLICY IF EXISTS "staff update evidence"  ON public.order_evidence;

CREATE POLICY "staff read evidence" ON public.order_evidence FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "dept insert evidence" ON public.order_evidence FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'dentist')
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_in_department(
         auth.uid(),
         (SELECT department_id FROM public.medical_orders WHERE id = order_id))
  );

CREATE POLICY "staff update evidence" ON public.order_evidence FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
