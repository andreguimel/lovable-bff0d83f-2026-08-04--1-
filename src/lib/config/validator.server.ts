/**
 * Config Validator — Validação de configuração do servidor.
 *
 * Chame `assertServerConfig()` no início de qualquer handler crítico (webhooks,
 * cron, jobs privilegiados) para falhar rápido quando ENVs obrigatórias
 * estiverem ausentes ou malformadas.
 *
 * Não chame no bundle client (usa `process.env`). Não chame no top-level de
 * módulos client-safe.
 */

import { z } from "zod";

const ServerConfigSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  LOVABLE_API_KEY: z.string().min(10).optional(),
  FLOW_SCHEDULER_SECRET: z.string().min(16).optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let cached: ServerConfig | null = null;

export function assertServerConfig(): ServerConfig {
  if (cached) return cached;
  const parsed = ServerConfigSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LOVABLE_API_KEY: process.env.LOVABLE_API_KEY,
    FLOW_SCHEDULER_SECRET: process.env.FLOW_SCHEDULER_SECRET,
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const missing = Object.entries(flat)
      .map(([k, v]) => `${k}: ${(v ?? []).join(", ")}`)
      .join("; ");
    throw new Error(`CONFIG_INVALID: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/** Utilitário para health check retornar diagnóstico sem lançar. */
export function inspectServerConfig(): { ok: boolean; issues: string[] } {
  try {
    assertServerConfig();
    return { ok: true, issues: [] };
  } catch (e: any) {
    return { ok: false, issues: [String(e?.message ?? e)] };
  }
}
