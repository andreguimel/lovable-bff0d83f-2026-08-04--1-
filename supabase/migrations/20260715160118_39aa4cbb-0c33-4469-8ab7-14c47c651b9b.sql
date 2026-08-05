-- Fix broken RLS on contact-files storage bucket.
-- Previously any authenticated user could access any company's files.
-- Now scope by joining path[1] (contact_id) to contacts.company_id via profile.

DROP POLICY IF EXISTS contact_files_read ON storage.objects;
DROP POLICY IF EXISTS contact_files_insert ON storage.objects;
DROP POLICY IF EXISTS contact_files_delete ON storage.objects;

CREATE POLICY contact_files_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND public.is_company_member(c.company_id)
  )
);

CREATE POLICY contact_files_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND public.is_company_member(c.company_id)
  )
);

CREATE POLICY contact_files_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND public.is_company_member(c.company_id)
  )
);

CREATE POLICY contact_files_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND public.is_company_member(c.company_id)
  )
);