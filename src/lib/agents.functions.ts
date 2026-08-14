import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGuardianModel } from "@/lib/ai-provider.server";
import { DEFAULT_AGENT_MODEL } from "@/lib/agents.constants";
import { requireAdmin } from "@/lib/rbac/guard";

export type Agent = {
  id: string;
  company_id: string;
  name: string;
  role: string | null;
  avatar_url: string | null;
  model: string;
  temperature: number;
  prompt: string | null;
  personality: string | null;
  language: string;
  greeting: string | null;
  channel_ids: string[];
  enabled_tools: string[];
  max_turns: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: string | null;
  specialty?: string | null;
  version?: number | null;
  status?: string | null;
  top_p?: number | null;
  max_tokens?: number | null;
  frequency_penalty?: number | null;
  presence_penalty?: number | null;
  metrics?: Record<string, number | string | null> | null;
  last_activity_at?: string | null;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  await requireAdmin(context);
}


export const listAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_agents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Agent[];
  });

export const getAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_agents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Agente não encontrado.");
    return row as Agent;
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Nome obrigatório"),
  role: z.string().nullish(),
  department: z.string().nullish(),
  specialty: z.string().nullish(),
  prompt: z.string().nullish(),
  personality: z.string().nullish(),
  greeting: z.string().nullish(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  language: z.string().min(2),
  channel_ids: z.array(z.string().uuid()).default([]),
  enabled_tools: z.array(z.string()).default([]),
  max_turns: z.number().int().min(1).max(20).default(6),
  is_active: z.boolean().default(true),
  avatar_url: z.string().url().nullish(),
  top_p: z.number().min(0).max(1).nullish(),
  max_tokens: z.number().int().positive().nullish(),
  frequency_penalty: z.number().min(-2).max(2).nullish(),
  presence_penalty: z.number().min(-2).max(2).nullish(),
  status: z.string().nullish(),
  version: z.number().int().nullish(),
});

export const upsertAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada.");

    const payload = {
      ...data,
      company_id: profile.company_id,
      role: data.role ?? null,
      department: data.department ?? null,
      specialty: data.specialty ?? null,
      prompt: data.prompt ?? null,
      personality: data.personality ?? null,
      greeting: data.greeting ?? null,
      avatar_url: data.avatar_url ?? null,
      top_p: data.top_p ?? null,
      max_tokens: data.max_tokens ?? null,
      frequency_penalty: data.frequency_penalty ?? null,
      presence_penalty: data.presence_penalty ?? null,
      status: data.status ?? null,
      version: data.version ?? null,
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("ai_agents")
        .update(payload as any)
        .eq("id", data.id)
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row as Agent;
    }
    const { data: row, error } = await context.supabase
      .from("ai_agents")
      .insert(payload as any)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as Agent;
  });


export const toggleAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("ai_agents")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("ai_agents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const TestSchema = z.object({
  id: z.string().uuid(),
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .default([]),
});

export const testAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: agent, error } = await context.supabase
      .from("ai_agents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!agent) throw new Error("Agente não encontrado.");

    const modelId = (agent.model as string) || DEFAULT_AGENT_MODEL;
    const { model } = await buildGuardianModel(context.supabase, agent.company_id, modelId);

    const systemParts = [
      `Você é ${agent.name}${agent.role ? `, ${agent.role}` : ""}.`,
      `Idioma de resposta: ${agent.language ?? "pt-BR"}.`,
      agent.personality ? `Personalidade: ${agent.personality}` : null,
      agent.greeting ? `Saudação padrão: ${agent.greeting}` : null,
      agent.prompt ? `Instruções:\n${agent.prompt}` : null,
      Array.isArray(agent.enabled_tools) && agent.enabled_tools.length
        ? `Ferramentas disponíveis (descreva quando usaria, sem executar): ${agent.enabled_tools.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const result = await generateText({
        model,
        temperature: Number(agent.temperature ?? 0.7),
        system: systemParts,
        messages: [
          ...data.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: data.message },
        ],
      });

      const output = result.text;
      await context.supabase.from("ai_agent_runs").insert({
        agent_id: agent.id,
        company_id: agent.company_id,
        user_id: context.userId,
        input: data.message,
        output,
        model: modelId,
        tokens_input: result.usage?.inputTokens ?? null,
        tokens_output: result.usage?.outputTokens ?? null,
      });

      return { output, model: modelId };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro ao chamar o modelo.";
      await context.supabase.from("ai_agent_runs").insert({
        agent_id: agent.id,
        company_id: agent.company_id,
        user_id: context.userId,
        input: data.message,
        error: message,
        model: modelId,
      });
      throw new Error(message);
    }
  });
