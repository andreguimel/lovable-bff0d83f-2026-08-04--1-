REVOKE EXECUTE ON FUNCTION public.exec_read_sql(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_invite_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;