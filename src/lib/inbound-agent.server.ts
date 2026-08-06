/**
 * Auto-resposta por agente IA para mensagens inbound (webhooks de provedor).
 * Compartilhado entre os receivers (Meta Cloud, Stevo).
 */
type SupabaseAdmin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export async function triggerAgentReply(args: {
  supabaseAdmin: SupabaseAdmin;
  companyId: string;
  conversationId: string;
  agentId: string;
  channel: {
    id: string;
    provider_type: string | null;
    credentials: Record<string, unknown> | null;
    phone_number: string | null;
  };
  toPhone: string;
  inboundMessageId?: string | null;
}) {
  const { resolveActiveAIProvider } = await import("@/lib/ai-provider.server");
  const aiConfig = await resolveActiveAIProvider(args.supabaseAdmin, args.companyId).catch(() => null);

  const apiKey =
    aiConfig?.apiKey ||
    process.env["OPENAI_API_KEY"] ||
    process.env["ANTHROPIC_API_KEY"] ||
    process.env["GEMINI_API_KEY"] ||
    process.env["GOOGLE_GENERATIVE_AI_API_KEY"] ||
    process.env["GROQ_API_KEY"];

  if (!apiKey) return;

  // Guarda anti-duplicidade: uma única auto-resposta por mensagem recebida.
  if (args.inboundMessageId) {
    const { data: already } = await args.supabaseAdmin
      .from("messages")
      .select("id")
      .eq("conversation_id", args.conversationId)
      .eq("direction", "outbound")
      .eq("reply_to_id", args.inboundMessageId)
      .maybeSingle();
    if (already) return;
  }

  const { data: agent } = await args.supabaseAdmin
    .from("ai_agents")
    .select("id, name, model, prompt, personality, company_id, is_active")
    .eq("id", args.agentId)
    .maybeSingle();
  if (!agent) return;
  // Defensive cross-tenant check (RLS bypassed here — service role)
  if (agent.company_id !== args.companyId) return;
  // Inactive agents MUST NOT auto-respond
  if (!agent.is_active) return;

  const { data: history } = await args.supabaseAdmin
    .from("messages")
    .select("direction, type, body")
    .eq("conversation_id", args.conversationId)
    .order("created_at", { ascending: true })
    .limit(30);

  const systemPrompt = [
    agent.prompt || "Você é um atendente prestativo.",
    agent.personality ? `Personalidade: ${agent.personality}` : "",
    "Responda em português, de forma clara, curta e objetiva.",
  ]
    .filter(Boolean)
    .join("\n\n");

  type HistoryRow = { direction: "inbound" | "outbound"; type: string; body: string | null };
  const messages = [
    { role: "system", content: systemPrompt },
    ...((history ?? []) as HistoryRow[])
      .filter((m) => m.type === "text" && m.body)
      .map((m) => ({ role: m.direction === "outbound" ? "assistant" : "user", content: m.body ?? "" })),
  ];

  const model = aiConfig?.model || agent.model || "google/gemini-2.5-flash";
  let reply: string | null = null;

  if (aiConfig && aiConfig.provider !== "lovable") {
    // Custom user provider (OpenAI, Anthropic, Gemini)
    const { generateText } = await import("ai");
    const { buildGuardianModel } = await import("@/lib/ai-provider.server");
    const built = await buildGuardianModel(args.supabaseAdmin, args.companyId);
    const res = await generateText({
      model: built.model,
      system: systemPrompt,
      messages: messages.filter((m) => m.role !== "system") as never,
    });
    reply = res.text?.trim() ?? null;
  } else {
    // Lovable AI Gateway fallback
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({ model, messages }),
    });
    if (!resp.ok) return;
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    reply = j.choices?.[0]?.message?.content?.trim() ?? null;
  }

  if (!reply) return;

  // Send through provider first (to get provider_message_id), then persist
  const { dispatchSend } = await import("@/lib/wa-providers/index.server");
  const dispatch = await dispatchSend(args.channel, {
    type: "text",
    to: args.toPhone.replace(/^\+/, ""),
    body: reply,
  });

  await args.supabaseAdmin.from("messages").insert({
    company_id: args.companyId,
    conversation_id: args.conversationId,
    direction: "outbound",
    type: "text",
    body: reply,
    status: dispatch.ok ? "sent" : "failed",
    provider_message_id: dispatch.ok ? dispatch.provider_message_id : null,
    sender_user_id: null,
    reply_to_id: args.inboundMessageId ?? null,
    media_metadata: {
      automated: true,
      auto: true,
      agent_id: agent.id,
      agent_name: agent.name,
      model,
      ...(dispatch.ok ? {} : { send_error: dispatch.error }),
    },
  });

  await args.supabaseAdmin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: reply.slice(0, 120),
    })
    .eq("id", args.conversationId);
}
