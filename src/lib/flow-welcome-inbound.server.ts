/**
 * Welcome Flow inbound trigger — server-only helper.
 *
 * Aplica `channels.default_welcome_flow_id`: quando um contato novo aparece
 * no Inbox (primeira mensagem inbound), o fluxo de boas-vindas do canal é
 * iniciado automaticamente.
 *
 * Garantias:
 *  - Só dispara para contato novo OU conversa sem histórico anterior.
 *  - Nunca dispara se já existe um run em aberto na conversa (o wait_reply
 *    tem prioridade — o webhook chama o resume antes deste helper).
 *  - Idempotente por conversa via `idempotency_key = welcome:<conversationId>`.
 *  - Best-effort: qualquer falha é reportada, nunca lançada para o webhook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type WelcomeFlowResult = {
  started: boolean;
  runId?: string;
  reason?:
    | "no_welcome_flow"
    | "not_new_contact"
    | "run_in_progress"
    | "already_started"
    | "flow_unavailable"
    | "executor_failed";
  error?: string;
};

export async function startWelcomeFlowForNewContact(args: {
  supabase: SupabaseClient;
  companyId: string;
  channelId: string;
  conversationId: string;
  contactId: string;
  welcomeFlowId: string | null | undefined;
  isNewContact: boolean;
  message?: {
    provider_message_id: string | null;
    type: string;
    body: string | null;
    from_phone: string;
  };
  // Injetável para testes; por padrão usa o executor real.
  createAndExecuteRun?: (input: {
    supabase: SupabaseClient;
    companyId: string;
    flowId: string;
    conversationId: string;
    channelId: string;
    triggerType: string;
    triggerPayload: Record<string, unknown>;
    variables: Record<string, unknown>;
    idempotencyKey: string;
  }) => Promise<{ runId: string }>;
}): Promise<WelcomeFlowResult> {
  const { supabase, companyId, channelId, conversationId, contactId, welcomeFlowId } = args;

  if (!welcomeFlowId) return { started: false, reason: "no_welcome_flow" };

  // 1) Elegibilidade: contato novo ou conversa ainda sem histórico anterior.
  if (!args.isNewContact) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    if ((count ?? 0) > 1) return { started: false, reason: "not_new_contact" };
  }

  // 2) Nunca atropela um run em andamento na mesma conversa.
  const { data: openRun } = await supabase
    .from("flow_runs")
    .select("id")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .is("completed_at", null)
    .limit(1)
    .maybeSingle();
  if (openRun) return { started: false, reason: "run_in_progress" };

  const idempotencyKey = `welcome:${conversationId}`;
  const { data: previous } = await supabase
    .from("flow_runs")
    .select("id")
    .eq("company_id", companyId)
    .eq("idempotency_key" as never, idempotencyKey)
    .limit(1)
    .maybeSingle();
  if (previous) {
    return { started: false, runId: (previous as { id: string }).id, reason: "already_started" };
  }

  // 3) O fluxo precisa existir, pertencer à empresa e estar ativo.
  const { data: flow } = await supabase
    .from("flows")
    .select("id, company_id, status")
    .eq("id", welcomeFlowId)
    .maybeSingle();
  const f = flow as { id: string; company_id: string; status: string } | null;
  if (!f || f.company_id !== companyId || f.status !== "active") {
    return { started: false, reason: "flow_unavailable" };
  }

  const runner =
    args.createAndExecuteRun ??
    (async (input) => {
      const { createAndExecuteRun } = await import("@/lib/flow-executor.server");
      return createAndExecuteRun(input);
    });

  try {
    const res = await runner({
      supabase,
      companyId,
      flowId: welcomeFlowId,
      conversationId,
      channelId,
      triggerType: "new_contact",
      triggerPayload: {
        contact_id: contactId,
        conversation_id: conversationId,
        channel_id: channelId,
        provider_message_id: args.message?.provider_message_id ?? null,
      },
      variables: {
        contact: { id: contactId, phone: args.message?.from_phone ?? null },
        last_message: args.message?.body ?? "",
        message: args.message
          ? {
              id: args.message.provider_message_id,
              type: args.message.type,
              body: args.message.body,
              from: args.message.from_phone,
            }
          : null,
      },
      idempotencyKey,
    });
    return { started: true, runId: res.runId };
  } catch (e) {
    return { started: false, reason: "executor_failed", error: String((e as Error).message ?? e) };
  }
}
