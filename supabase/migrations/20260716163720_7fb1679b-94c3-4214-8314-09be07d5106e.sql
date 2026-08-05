
REVOKE ALL ON FUNCTION public.audit_message_deletion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_message_deletion() FROM anon;
REVOKE ALL ON FUNCTION public.audit_message_deletion() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_message_deletion() TO service_role;
