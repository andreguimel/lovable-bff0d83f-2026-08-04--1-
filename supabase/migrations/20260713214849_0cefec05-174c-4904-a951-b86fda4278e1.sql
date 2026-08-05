
-- Storage: files are organized as {company_id}/{...}. RLS ensures members only touch their own folder.
CREATE POLICY "Members read own company files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('message-media','agent-knowledge','avatars')
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

CREATE POLICY "Members upload to own company folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('message-media','agent-knowledge','avatars')
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

CREATE POLICY "Members update own company files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('message-media','agent-knowledge','avatars')
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

CREATE POLICY "Members delete own company files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('message-media','agent-knowledge','avatars')
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);
