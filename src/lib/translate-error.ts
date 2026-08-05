// Map common Supabase / Postgres errors to Portuguese user-facing text.
const MAP: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "E-mail ou senha inválidos."],
  [/email not confirmed/i, "Confirme seu e-mail antes de entrar."],
  [/user already registered/i, "Este e-mail já está cadastrado."],
  [/password should be at least (\d+)/i, "A senha deve ter ao menos $1 caracteres."],
  [/rate limit exceeded/i, "Muitas tentativas. Aguarde alguns segundos e tente de novo."],
  [/duplicate key value/i, "Registro duplicado."],
  [/violates foreign key/i, "Este item ainda está em uso por outro registro."],
  [/permission denied/i, "Você não tem permissão para esta ação."],
  [/row-level security/i, "Acesso negado pelas regras de segurança."],
  [/network|failed to fetch/i, "Falha de rede. Verifique sua conexão."],
  [/limite do plano/i, ""], // already Portuguese; keep as-is
];

export function translateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Erro desconhecido");
  for (const [re, replacement] of MAP) {
    if (re.test(raw)) return replacement === "" ? raw : raw.replace(re, replacement);
  }
  return raw;
}
