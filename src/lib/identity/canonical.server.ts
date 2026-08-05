/**
 * ZENDA CORE ALIGNMENT 01 — Onda 2
 * Helpers server-only para identidade canônica de contato e conversa lógica.
 *
 * Regra do produto:
 *   um contato canônico (por telefone E.164)  →  uma conversa lógica ativa por empresa
 *
 * Estes helpers são idempotentes e seguros para chamadas concorrentes (webhook +
 * dispatch + cascade). Usam SELECT antes de INSERT com UNIQUE constraints como
 * rede de proteção — se dois callers correrem, o UNIQUE serializa e o segundo
 * cai em fallback de SELECT.
 */
import type { supabaseAdmin as SupabaseAdmin } from "@/integrations/supabase/client.server";

import { toE164 } from "./phone";

type Admin = typeof SupabaseAdmin;

export interface CanonicalContactInput {
  companyId: string;
  rawPhone: string;
  name?: string | null;
}

export interface CanonicalContactResult {
  contactId: string;
  phoneCanonical: string | null;
  isNew: boolean;
}

/**
 * Localiza ou cria um contato canônico baseado no telefone normalizado.
 * Se o telefone não puder ser normalizado com segurança, cria um contato
 * pelo `phone` bruto (comportamento legado, sem merge cross-formato).
 */
export async function findOrCreateCanonicalContact(
  sb: Admin,
  input: CanonicalContactInput,
): Promise<CanonicalContactResult> {
  const canonical = toE164(input.rawPhone);

  // 1) Match por phone_canonical (identidade forte)
  if (canonical) {
    const { data: byCanon } = await sb
      .from("contacts")
      .select("id, name")
      .eq("company_id", input.companyId)
      .eq("phone_canonical", canonical)
      .is("deleted_at", null)
      .is("merged_into_id", null)
      .maybeSingle();
    if (byCanon) {
      if (!byCanon.name && input.name) {
        await sb.from("contacts").update({ name: input.name }).eq("id", byCanon.id);
      }
      return { contactId: byCanon.id, phoneCanonical: canonical, isNew: false };
    }
  }

  // 2) Match legado por phone bruto (compat) — não fundir com incerteza
  const { data: byRaw } = await sb
    .from("contacts")
    .select("id, name, phone_canonical")
    .eq("company_id", input.companyId)
    .eq("phone", input.rawPhone)
    .is("deleted_at", null)
    .is("merged_into_id", null)
    .maybeSingle();
  if (byRaw) {
    // Backfill phone_canonical quando descobrimos agora, sem alterar identidade
    const patch: { phone_canonical?: string; name?: string } = {};
    if (!byRaw.phone_canonical && canonical) patch.phone_canonical = canonical;
    if (!byRaw.name && input.name) patch.name = input.name;
    if (Object.keys(patch).length > 0) await sb.from("contacts").update(patch).eq("id", byRaw.id);
    return { contactId: byRaw.id, phoneCanonical: canonical, isNew: false };
  }

  // 3) INSERT — o UNIQUE parcial (company_id, phone_canonical) serializa races
  const { data: created, error } = await sb
    .from("contacts")
    .insert({
      company_id: input.companyId,
      phone: input.rawPhone,
      phone_canonical: canonical,
      name: input.name ?? input.rawPhone,
    })
    .select("id")
    .single();

  if (!error && created) {
    return { contactId: created.id, phoneCanonical: canonical, isNew: true };
  }

  // 4) Fallback pós-race: se o UNIQUE bateu, re-lê e retorna o vencedor
  if (canonical) {
    const { data: raced } = await sb
      .from("contacts")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("phone_canonical", canonical)
      .is("deleted_at", null)
      .is("merged_into_id", null)
      .maybeSingle();
    if (raced) return { contactId: raced.id, phoneCanonical: canonical, isNew: false };
  }

  throw new Error(`Falha ao criar contato canônico: ${error?.message ?? "unknown"}`);
}

export interface LogicalConversationInput {
  companyId: string;
  contactId: string;
  originChannelId: string | null;
  aiAgentId?: string | null;
}

export interface LogicalConversationResult {
  conversationId: string;
  isNew: boolean;
}

/**
 * Localiza ou cria a UMA conversa lógica ativa do contato dentro da empresa.
 * A busca NÃO filtra por channel_id — é intencional: mensagens de vários canais
 * pertencem à mesma conversa canônica.
 */
export async function findOrCreateLogicalConversation(
  sb: Admin,
  input: LogicalConversationInput,
): Promise<LogicalConversationResult> {
  // 1) Existe conversa ativa (open/pending) para este contato?
  const { data: openConv } = await sb
    .from("conversations")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("contact_id", input.contactId)
    .in("status", ["open", "pending"])
    .is("merged_into_id", null)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (openConv) return { conversationId: openConv.id, isNew: false };

  // 2) Criar uma nova. O UNIQUE parcial serializa races.
  const { data: created, error } = await sb
    .from("conversations")
    .insert({
      company_id: input.companyId,
      channel_id: input.originChannelId,
      contact_id: input.contactId,
      status: "open",
      unread_count: 0,
      assigned_type: input.aiAgentId ? "ai_agent" : "unassigned",
      assigned_agent_id: input.aiAgentId ?? null,
    })
    .select("id")
    .single();
  if (!error && created) return { conversationId: created.id, isNew: true };

  // 3) Fallback pós-race
  const { data: raced } = await sb
    .from("conversations")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("contact_id", input.contactId)
    .in("status", ["open", "pending"])
    .is("merged_into_id", null)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (raced) return { conversationId: raced.id, isNew: false };

  throw new Error(`Falha ao criar conversa lógica: ${error?.message ?? "unknown"}`);
}

/**
 * STOP-ON-REPLY correlacionado — interrompe SOMENTE cascatas de reengajamento
 * do contato (company_id + contact_id), preservando flows, broadcasts e outras
 * automações não relacionadas.
 *
 * Retorna quantas cascatas foram interrompidas.
 */
export async function stopReengagementCascades(
  sb: Admin,
  args: {
    companyId: string;
    contactId: string;
    replyMessageId: string;
    replyChannelId: string;
  },
): Promise<number> {
  const { data, error } = await sb.rpc("cascade_stop_on_reply", {
    _company_id: args.companyId,
    _contact_id: args.contactId,
    _reply_message_id: args.replyMessageId,
    _reply_channel_id: args.replyChannelId,
  });
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}
