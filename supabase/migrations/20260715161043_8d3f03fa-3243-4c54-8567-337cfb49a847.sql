DROP POLICY IF EXISTS "tmp company" ON public.team_member_profiles;

CREATE POLICY "tmp select company members"
  ON public.team_member_profiles FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "tmp insert self or admin"
  ON public.team_member_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_company_member(company_id)
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "tmp update self or admin"
  ON public.team_member_profiles FOR UPDATE
  TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_company_member(company_id)
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "tmp delete admin"
  ON public.team_member_profiles FOR DELETE
  TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );