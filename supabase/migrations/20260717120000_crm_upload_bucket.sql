
-- CRM data upload area (placeholder — only file storage for now, the actual
-- CRM lookup/matching features referenced elsewhere are future work). Files
-- go into a private storage bucket; only admins can upload/list/download/
-- delete, since this is expected to hold bulk historical patient data.
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm_data', 'crm_data', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins manage crm_data objects" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'crm_data' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'crm_data' AND public.has_role(auth.uid(), 'admin'));
