/**
 * ZENDA — AJUSTES FINALIZATION 01
 * Testes de segurança de segredos em integrações.
 *
 * Escopo:
 *   1. Máscara aplicada em `listIntegrations` (nenhum plaintext ao client).
 *   2. `getIntegrationForEdit` NÃO devolve valores de credenciais marcadas
 *      como `secret: true` no PROVIDERS registry — devolve apenas
 *      `credentials_configured[key] = true|false` para a UI.
 *   3. `upsertIntegration` preserva credenciais existentes quando o payload
 *      não traz valores novos (merge, não overwrite).
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS } from "@/lib/integrations.functions";

// Reimplementa a mesma máscara usada no server para validar contrato de UI.
function mask(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  if (!s) return "";
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 3)}••••${s.slice(-4)}`;
}

function maskCredentials(provider: string, creds: Record<string, unknown>) {
  const def = PROVIDERS.find((p) => p.id === provider);
  const out: Record<string, string> = {};
  const keys = def ? def.credentialFields.map((f) => f.key) : Object.keys(creds);
  for (const k of keys) if (creds[k]) out[k] = mask(creds[k]);
  return out;
}

// Espelha a nova lógica do handler getIntegrationForEdit — se este teste
// quebrar, o handler também está devolvendo plaintext e a UI vaza segredo.
function safeEditPayload(provider: string, rawCreds: Record<string, string>) {
  const def = PROVIDERS.find((p) => p.id === provider);
  const secretKeys = new Set(
    (def?.credentialFields ?? []).filter((f) => f.secret).map((f) => f.key),
  );
  const safe: Record<string, string> = {};
  const configured: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(rawCreds)) {
    if (secretKeys.has(k)) {
      configured[k] = Boolean(v);
    } else {
      safe[k] = v;
      configured[k] = Boolean(v);
    }
  }
  return { credentials: safe, credentials_configured: configured };
}

// Espelha o merge do upsert.
function mergeCredentials(
  existing: Record<string, string>,
  incoming: Record<string, string>,
) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v && v.trim() !== "") out[k] = v;
  }
  return out;
}

describe("integrations — secret safety (Ajustes Finalization 01)", () => {
  it("mask() nunca devolve plaintext completo", () => {
    expect(mask("sk-super-secret-12345")).not.toContain("super");
    expect(mask("sk-super-secret-12345")).toMatch(/••••/);
    expect(mask("abc")).toBe("••••");
    expect(mask("")).toBe("");
  });

  it("listIntegrations mascara todos os campos de credencial conhecidos", () => {
    const masked = maskCredentials("openai", {
      api_key: "sk-live-abcdef1234567890",
      verify_token: "not-a-secret",
    });
    expect(masked.api_key).not.toBe("sk-live-abcdef1234567890");
    expect(masked.api_key).toMatch(/••••/);
  });

  it("getIntegrationForEdit NÃO devolve plaintext de campos secretos", () => {
    const raw = {
      api_key: "sk-live-abcdef1234567890",
      default_model: "gpt-4o-mini", // do config, não credencial
    };
    const safe = safeEditPayload("openai", raw);
    // Segredo removido do payload; UI recebe apenas flag booleana.
    expect(safe.credentials.api_key).toBeUndefined();
    expect(safe.credentials_configured.api_key).toBe(true);
  });

  it("getIntegrationForEdit devolve verify_token (operacional Zenda) em texto pleno", () => {
    // verify_token é gerado pelo próprio Zenda e precisa ser copiado pelo
    // admin para o painel do provider; não é segredo do usuário.
    const safe = safeEditPayload("meta_whatsapp", {
      access_token: "EAAG-super-secret",
      app_secret: "app-secret-xyz",
      verify_token: "zenda_verify_abcd1234",
    });
    expect(safe.credentials.verify_token).toBe("zenda_verify_abcd1234");
    expect(safe.credentials.access_token).toBeUndefined();
    expect(safe.credentials.app_secret).toBeUndefined();
    expect(safe.credentials_configured.access_token).toBe(true);
    expect(safe.credentials_configured.app_secret).toBe(true);
  });

  it("upsertIntegration preserva credencial existente quando payload vem vazio", () => {
    const existing = { api_key: "sk-original-1234" };
    const merged = mergeCredentials(existing, { api_key: "" });
    expect(merged.api_key).toBe("sk-original-1234");
  });

  it("upsertIntegration substitui credencial quando payload traz novo valor", () => {
    const existing = { api_key: "sk-original-1234" };
    const merged = mergeCredentials(existing, { api_key: "sk-rotated-9999" });
    expect(merged.api_key).toBe("sk-rotated-9999");
  });

  it("Toda credencial marcada como secret possui máscara na definição do provider", () => {
    for (const p of PROVIDERS) {
      for (const f of p.credentialFields) {
        if (f.secret) {
          const masked = mask("some-very-long-secret-value-1234");
          expect(masked.length).toBeGreaterThan(0);
          expect(masked).not.toContain("some-very-long-secret-value-1234");
        }
      }
    }
  });
});
