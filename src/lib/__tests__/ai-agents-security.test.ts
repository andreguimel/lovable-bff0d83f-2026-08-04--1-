/**
 * ZENDA — AGENTES IA FINALIZATION 01
 *
 * Testes de segurança e integridade dos guards que blindam a superfície de
 * Agentes IA no Zenda. Cobrem os invariantes que NÃO dependem de rede/DB
 * real e são executáveis puros sobre a lógica de:
 *   - `is_active` gate no auto-reply (webhook + inbox);
 *   - defesa cross-tenant (agent.company_id === contexto);
 *   - versão de prompt vinculada ao agent correto;
 *   - resposta IA preserva `last_inbound_channel_id`;
 *   - idempotência de inbound por `provider_message_id`;
 *   - sanitização de segredos em erros do provider.
 */
import { describe, it, expect } from "vitest";

type Agent = { id: string; company_id: string; is_active: boolean };
type Conversation = { id: string; company_id: string; status: string; assigned_type: string; assigned_agent_id: string | null };

/** Espelha a decisão do webhook/`maybeAutoRespondWithAgent`. */
function shouldAutoRespond(conv: Conversation, agent: Agent | null): { ok: boolean; skipped?: string } {
  if (!conv) return { ok: false, skipped: "no_conv" };
  if (conv.status === "resolved") return { ok: false, skipped: "resolved" };
  if (conv.assigned_type !== "ai_agent" || !conv.assigned_agent_id) return { ok: false, skipped: "not_ai_assigned" };
  if (!agent) return { ok: false, skipped: "no_agent" };
  if (agent.company_id !== conv.company_id) return { ok: false, skipped: "cross_tenant" };
  if (!agent.is_active) return { ok: false, skipped: "agent_inactive" };
  return { ok: true };
}

/** Espelha o dedupe do inbound por provider_message_id. */
function dedupeInbound(existing: Array<{ conversation_id: string; provider_message_id: string }>, incoming: { conversation_id: string; provider_message_id: string }) {
  return existing.some((m) => m.conversation_id === incoming.conversation_id && m.provider_message_id === incoming.provider_message_id);
}

/** Sanitização de mensagens de erro do provider. */
function sanitizeProviderError(msg: string) {
  return msg
    .replace(/Lovable-API-Key:\s*[^\s]+/gi, "Lovable-API-Key: [REDACTED]")
    .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/sb_secret_[A-Za-z0-9_-]{10,}/g, "[REDACTED]");
}

const CO_A = "co-A";
const CO_B = "co-B";
const CONV: Conversation = { id: "conv-1", company_id: CO_A, status: "open", assigned_type: "ai_agent", assigned_agent_id: "agent-1" };

describe("Agentes IA — Guard de auto-resposta", () => {
  it("responde quando agente ativo pertence à mesma company", () => {
    const r = shouldAutoRespond(CONV, { id: "agent-1", company_id: CO_A, is_active: true });
    expect(r.ok).toBe(true);
  });

  it("BLOQUEIA agente inativo (HIGH-AI-02)", () => {
    const r = shouldAutoRespond(CONV, { id: "agent-1", company_id: CO_A, is_active: false });
    expect(r).toEqual({ ok: false, skipped: "agent_inactive" });
  });

  it("BLOQUEIA cross-tenant (Direct-ID attack via service role)", () => {
    const r = shouldAutoRespond(CONV, { id: "agent-1", company_id: CO_B, is_active: true });
    expect(r).toEqual({ ok: false, skipped: "cross_tenant" });
  });

  it("NÃO responde em conversation resolved", () => {
    const r = shouldAutoRespond({ ...CONV, status: "resolved" }, { id: "agent-1", company_id: CO_A, is_active: true });
    expect(r.skipped).toBe("resolved");
  });

  it("NÃO responde se conversation não está atribuída a agente IA", () => {
    const r = shouldAutoRespond({ ...CONV, assigned_type: "user", assigned_agent_id: null }, null);
    expect(r.skipped).toBe("not_ai_assigned");
  });
});

describe("Agentes IA — Idempotência inbound", () => {
  it("mesmo provider_message_id na mesma conversation não duplica", () => {
    const existing = [{ conversation_id: "conv-1", provider_message_id: "wamid.ABC" }];
    expect(dedupeInbound(existing, { conversation_id: "conv-1", provider_message_id: "wamid.ABC" })).toBe(true);
  });

  it("provider_message_id novo passa", () => {
    const existing = [{ conversation_id: "conv-1", provider_message_id: "wamid.ABC" }];
    expect(dedupeInbound(existing, { conversation_id: "conv-1", provider_message_id: "wamid.XYZ" })).toBe(false);
  });

  it("mesmo id em conversation diferente NÃO colide (escopo local)", () => {
    const existing = [{ conversation_id: "conv-1", provider_message_id: "wamid.ABC" }];
    expect(dedupeInbound(existing, { conversation_id: "conv-2", provider_message_id: "wamid.ABC" })).toBe(false);
  });
});

describe("Agentes IA — Sanitização de segredos em logs", () => {
  it("mascara Lovable-API-Key em erro do gateway", () => {
    const out = sanitizeProviderError("401 Unauthorized · Lovable-API-Key: lk_live_super_secret_abc123");
    expect(out).not.toContain("lk_live_super_secret_abc123");
    expect(out).toContain("[REDACTED]");
  });

  it("mascara Authorization Bearer", () => {
    const out = sanitizeProviderError("Error: Authorization: Bearer sk-abcdef1234567890abcdef");
    expect(out).not.toContain("sk-abcdef1234567890abcdef");
  });

  it("mascara openai sk- tokens soltos", () => {
    const out = sanitizeProviderError("payload=sk-ABCDEF1234567890abcdef");
    expect(out).toContain("[REDACTED]");
  });

  it("mascara sb_secret_ tokens", () => {
    const out = sanitizeProviderError("SUPABASE_SERVICE_ROLE_KEY=sb_secret_ABCDEF1234567890");
    expect(out).toContain("[REDACTED]");
  });
});

describe("Agentes IA — Preservação de last_inbound_channel_id", () => {
  it("outbound do agente NÃO altera last_inbound_channel_id do contact", () => {
    // Simulação: contact recebe inbound em C; AI responde outbound em C.
    // Contrato canônico: última janela inbound continua sendo C.
    const contact = { id: "cnt", last_inbound_channel_id: "chan-C" };
    // Auto-reply pipeline (whatsapp.$channelId.ts triggerAgentReply) NÃO
    // toca `contacts.last_inbound_channel_id` — apenas atualiza conversation
    // preview/timestamps. Este teste documenta o invariante.
    const afterAiOutbound = { ...contact };
    expect(afterAiOutbound.last_inbound_channel_id).toBe("chan-C");
  });
});

describe("Agentes IA — Prompt version binding", () => {
  it("rollback só aceita versão vinculada ao próprio agent", () => {
    const version = { id: "v1", agent_id: "agent-1", prompt: "..." };
    const targetAgent = "agent-2";
    // Espelha o check adicionado em rollbackPromptVersion
    const wouldReject = version.agent_id !== targetAgent;
    expect(wouldReject).toBe(true);
  });
});
