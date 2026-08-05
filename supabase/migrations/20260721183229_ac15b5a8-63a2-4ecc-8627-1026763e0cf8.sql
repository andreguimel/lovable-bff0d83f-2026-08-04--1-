DROP POLICY IF EXISTS "Members can view company integrations" ON public.integrations;
CREATE POLICY "Admins can view company integrations"
ON public.integrations
FOR SELECT
TO authenticated
USING (
  is_company_member(company_id)
  AND has_role(auth.uid(), 'admin'::app_role)
);