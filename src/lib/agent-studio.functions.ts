import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGuardianModel } from "@/lib/ai-provider.server";
import { DEFAULT_AGENT_MODEL } from "@/lib/agents.constants";
import { requireAdmin } from "@/lib/rbac/guard";

/**
 * ZENDA — AGENTES IA FINALIZATION 01
 * Cross-tenant defensive helper: garante que o agent pertence à mesma company
 * do caller antes de operações sensíveis (versão de prompt, rollback,
 * knowledge docs, duplicação). Sob RLS o `.maybeSingle()` já retorna null
 * para agents de outra company, mas mantemos o check explícito para
 * bloquear qualquer regressão futura (Direct-ID attack).
 */
async function assertSameCompanyAgent(context: { supabase: any; userId: string }, agentId: string) {
  const { data: agent, error } = await context.supabase
    .from("ai_agents")
    .select("id, company_id")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!agent) throw new Error("Agente não encontrado.");
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.company_id || profile.company_id !== agent.company_id) {
    throw new Error("Agente não pertence à empresa atual.");
  }
  return agent.company_id as string;
}

// ---------- Dashboard / KPIs ----------
export const getAgentDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [logsAll, logsWeek, runs] = await Promise.all([
      sb.from("agent_logs").select("id", { count: "exact", head: true }).eq("agent_id", data.id),
      sb
        .from("agent_logs")
        .select("id, tokens_in, tokens_out, latency_ms, error, created_at")
        .eq("agent_id", data.id)
        .gte("created_at", since.toISOString()),
      sb
        .from("ai_agent_runs")
        .select("id, tokens_input, tokens_output, created_at")
        .eq("agent_id", data.id)
        .gte("created_at", since.toISOString()),
    ]);

    const week = (logsWeek.data ?? []) as Array<{
      tokens_in: number | null;
      tokens_out: number | null;
      latency_ms: number | null;
      error: string | null;
      created_at: string;
    }>;
    const runsWeek = (runs.data ?? []) as Array<{
      tokens_input: number | null;
      tokens_output: number | null;
      created_at: string;
    }>;

    const today = new Date().toISOString().slice(0, 10);
    const conversationsToday = week.filter((l) => l.created_at.startsWith(today)).length;
    const totalTokens =
      week.reduce((s, l) => s + (l.tokens_in ?? 0) + (l.tokens_out ?? 0), 0) +
      runsWeek.reduce((s, r) => s + (r.tokens_input ?? 0) + (r.tokens_output ?? 0), 0);
    const errors = week.filter((l) => !!l.error).length;
    const latencies = week.map((l) => l.latency_ms ?? 0).filter((n) => n > 0);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    const estimatedCost = Number((totalTokens / 1_000_000) * 0.25).toFixed(4);

    return {
      conversationsToday,
      conversationsTotal: logsAll.count ?? 0,
      avgLatencyMs: avgLatency,
      errors,
      tokens: totalTokens,
      estimatedCost,
    };
  });

// ---------- Prompt versions ----------
export const listPromptVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_prompt_versions")
      .select("id, version, prompt, notes, created_at")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      version: number;
      prompt: string;
      notes: string | null;
      created_at: string;
    }>;
  });

export const savePromptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        prompt: z.string(),
        notes: z.string().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    await assertSameCompanyAgent(context, data.agentId);
    const sb = context.supabase;
    const { data: profile } = await sb
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada.");

    const { data: last } = await sb
      .from("agent_prompt_versions")
      .select("version")
      .eq("agent_id", data.agentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((last?.version as number | undefined) ?? 0) + 1;

    const { error } = await sb.from("agent_prompt_versions").insert({
      agent_id: data.agentId,
      company_id: profile.company_id,
      version: nextVersion,
      prompt: data.prompt,
      notes: data.notes ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    await sb.from("ai_agents").update({ version: nextVersion, prompt: data.prompt }).eq("id", data.agentId);
    return { ok: true, version: nextVersion };
  });

export const rollbackPromptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agentId: z.string().uuid(), versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    await assertSameCompanyAgent(context, data.agentId);
    const sb = context.supabase;
    const { data: v, error } = await sb
      .from("agent_prompt_versions")
      .select("prompt, agent_id")
      .eq("id", data.versionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!v) throw new Error("Versão não encontrada.");
    if (v.agent_id !== data.agentId) throw new Error("Versão não pertence a este agente.");
    const { error: upErr } = await sb
      .from("ai_agents")
      .update({ prompt: v.prompt })
      .eq("id", data.agentId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// ---------- Logs ----------
export const listAgentLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agentId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_logs")
      .select("*")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      source: string;
      prompt: string | null;
      response: string | null;
      model: string | null;
      tokens_in: number | null;
      tokens_out: number | null;
      latency_ms: number | null;
      error: string | null;
      created_at: string;
    }>;
  });

// ---------- Playground ----------
export const runPlaygroundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        message: z.string().min(1),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
          .default([]),
        temperature: z.number().min(0).max(2).optional(),
        model: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: agent, error } = await sb
      .from("ai_agents")
      .select("*")
      .eq("id", data.agentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!agent) throw new Error("Agente não encontrado.");

    const modelId = data.model || (agent.model as string) || DEFAULT_AGENT_MODEL;
    const { model } = await buildGuardianModel(sb, agent.company_id, modelId);

    const system = [
      `Você é ${agent.name}${agent.role ? `, ${agent.role}` : ""}.`,
      `Idioma: ${agent.language ?? "pt-BR"}.`,
      agent.personality ? `Personalidade: ${agent.personality}` : null,
      agent.prompt ? `Instruções:\n${agent.prompt}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const started = Date.now();
    try {
      const result = await generateText({
        model,
        temperature: data.temperature ?? Number(agent.temperature ?? 0.7),
        system,
        messages: [
          ...data.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: data.message },
        ],
      });
      const latency = Date.now() - started;
      await sb.from("agent_logs").insert({
        agent_id: agent.id,
        company_id: agent.company_id,
        source: "playground",
        prompt: data.message,
        response: result.text,
        model: modelId,
        tokens_in: result.usage?.inputTokens ?? null,
        tokens_out: result.usage?.outputTokens ?? null,
        latency_ms: latency,
      });
      return {
        output: result.text,
        model: modelId,
        latencyMs: latency,
        tokensIn: result.usage?.inputTokens ?? null,
        tokensOut: result.usage?.outputTokens ?? null,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro ao chamar o modelo.";
      const latency = Date.now() - started;
      await sb.from("agent_logs").insert({
        agent_id: agent.id,
        company_id: agent.company_id,
        source: "playground",
        prompt: data.message,
        model: modelId,
        error: message,
        latency_ms: latency,
      });
      throw new Error(message);
    }
  });

// ---------- AI Copilot ----------
const CopilotAction = z.enum(["improve", "conflicts", "optimize", "simulate", "conversion"]);

export const runCopilotAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: CopilotAction,
        prompt: z.string(),
        agentName: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    const companyId = profile?.company_id ?? "";
    const { model } = await buildGuardianModel(context.supabase, companyId);

    const brief = {
      improve:
        "Você é um copiloto que MELHORA prompts de agentes IA. Reescreva o prompt tornando-o mais claro, estruturado e eficaz. Mantenha o idioma original. Retorne apenas o prompt reescrito, sem explicações.",
      conflicts:
        "Analise o prompt do agente IA e liste em bullets curtos possíveis CONFLITOS, ambiguidades e instruções contraditórias. Em português.",
      optimize:
        "Reescreva o prompt de forma mais concisa para REDUZIR o consumo de tokens sem perder o objetivo. Mantenha o idioma. Retorne apenas o novo prompt.",
      simulate:
        "Simule 3 mensagens realistas que um cliente enviaria para este agente e mostre como o agente deveria responder cada uma, respeitando o prompt. Formato markdown.",
      conversion:
        "Sugira 5 melhorias objetivas neste prompt para aumentar a TAXA DE CONVERSÃO em vendas. Em bullets curtos, em português.",
    }[data.action];

    const result = await generateText({
      model,
      system: brief,
      messages: [
        {
          role: "user" as const,
          content: `Agente: ${data.agentName ?? "-"}\n\nPrompt atual:\n${data.prompt || "(vazio)"}`,
        },
      ],
    });
    return { output: result.text };
  });

// ---------- Knowledge docs ----------
export const listKnowledgeDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_knowledge_docs")
      .select("*")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      title: string;
      type: string;
      source_url: string | null;
      storage_path: string | null;
      size_bytes: number | null;
      chunks: number;
      status: string;
      created_at: string;
    }>;
  });

export const registerKnowledgeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        title: z.string().min(1),
        type: z.string().default("file"),
        source_url: z.string().url().nullish(),
        storage_path: z.string().nullish(),
        size_bytes: z.number().int().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    await assertSameCompanyAgent(context, data.agentId);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada.");
    const { data: row, error } = await context.supabase
      .from("agent_knowledge_docs")
      .insert({
        agent_id: data.agentId,
        company_id: profile.company_id,
        title: data.title,
        type: data.type,
        source_url: data.source_url ?? null,
        storage_path: data.storage_path ?? null,
        size_bytes: data.size_bytes ?? null,
      })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteKnowledgeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    // RLS já filtra por company; delete só afeta linhas visíveis ao caller.
    const { error } = await context.supabase
      .from("agent_knowledge_docs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Duplicate agent ----------
export const duplicateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    await assertSameCompanyAgent(context, data.id);
    const sb = context.supabase;
    const { data: agent, error } = await sb
      .from("ai_agents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!agent) throw new Error("Agente não encontrado.");
    const copy: Record<string, unknown> = { ...agent };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.name = `${agent.name} (cópia)`;
    copy.status = "draft";
    copy.is_active = false;
    const { data: row, error: insErr } = await sb.from("ai_agents").insert(copy as never).select().maybeSingle();
    if (insErr) throw new Error(insErr.message);
    return row;
  });
