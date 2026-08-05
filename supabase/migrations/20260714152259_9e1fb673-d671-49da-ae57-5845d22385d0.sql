GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated, anon;