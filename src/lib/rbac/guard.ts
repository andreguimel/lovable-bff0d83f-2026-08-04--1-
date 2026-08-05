/**
 * RBAC Guards — Entrypoint ÚNICO de autorização em server functions.
 *
 * Este é o único arquivo do código de aplicação autorizado a chamar `has_role`,
 * e apenas como bootstrap do papel de administrador. Toda autorização granular
 * DEVE usar `requirePermission(context, P.MODULO.ACAO)`.
 *
 * NUNCA duplicar a lógica de `requireAdmin` em outros módulos. Importe daqui.
 */

import type { PermissionKey } from "./registry";

type AuthContext = { supabase: any; userId: string };

export class AuthorizationError extends Error {
  code = "AUTH_403";
  constructor(message = "Ação não autorizada.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Bootstrap admin check. Único uso legítimo de `has_role` na plataforma.
 * Usado para operações que ainda não foram mapeadas para uma permission key
 * específica no registry, e para o próprio gerenciamento do RBAC.
 */
export async function requireAdmin(
  context: AuthContext,
  message = "Somente administradores podem executar esta ação.",
): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new AuthorizationError(error.message);
  if (!data) throw new AuthorizationError(message);
}

/**
 * Verificação granular via matriz RBAC (role_permissions_v2 + overrides + admin default).
 * Preferir este helper para todas as autorizações novas.
 */
export async function requirePermission(
  context: AuthContext,
  key: PermissionKey | string,
  message?: string,
): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_permission", {
    _user_id: context.userId,
    _permission_key: key,
  });
  if (error) throw new AuthorizationError(error.message);
  if (!data) throw new AuthorizationError(message ?? `Permissão negada: ${key}`);
}

export async function hasPermission(
  context: AuthContext,
  key: PermissionKey | string,
): Promise<boolean> {
  const { data } = await context.supabase.rpc("has_permission", {
    _user_id: context.userId,
    _permission_key: key,
  });
  return !!data;
}
