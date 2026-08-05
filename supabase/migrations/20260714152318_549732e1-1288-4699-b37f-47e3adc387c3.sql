REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid) FROM anon;