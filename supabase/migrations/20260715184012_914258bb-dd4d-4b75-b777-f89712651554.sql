-- HIGH 2 — Restringir EXECUTE em funções SECURITY DEFINER
-- Todas já possuem search_path=public; apenas revogar acesso de anon/PUBLIC
-- e conceder EXECUTE explicitamente aos roles que precisam.
-- Idempotente: REVOKE/GRANT são no-op quando o estado já está aplicado.

REVOKE EXECUTE ON FUNCTION public.accept_invite_token(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_invite_token(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.flow_run_acquire_lock(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.flow_run_acquire_lock(uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.flow_run_release_lock(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.flow_run_release_lock(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.my_effective_permissions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_effective_permissions() TO authenticated;

-- Reforço defensivo: exec_read_sql já é restrito, garantir PUBLIC/anon revogados.
REVOKE EXECUTE ON FUNCTION public.exec_read_sql(text) FROM PUBLIC, anon, authenticated;