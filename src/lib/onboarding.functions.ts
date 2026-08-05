import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingProgress = {
  company_id: string;
  step_channel_created: boolean;
  step_whatsapp_connected: boolean;
  step_agent_created: boolean;
  step_first_message_sent: boolean;
  completed_at: string | null;
  dismissed_at: string | null;
};

export type OnboardingSummary = {
  progress: OnboardingProgress;
  totals: {
    channels: number;
    connectedChannels: number;
    agents: number;
    outboundMessages: number;
  };
  percent: number;
};

const stepSchema = z.object({
  step: z.enum([
    "step_channel_created",
    "step_whatsapp_connected",
    "step_agent_created",
    "step_first_message_sent",
  ]),
  value: z.boolean().optional(),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
async function ensureRow(supabase: any, companyId: string) {
  await supabase
    .from("onboarding_progress")
    .upsert({ company_id: companyId }, { onConflict: "company_id" });
}

async function loadCompanyId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("company_id").eq("id", userId).single();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

export const getOnboardingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingSummary> => {
    const companyId = await loadCompanyId(context.supabase, context.userId);
    await ensureRow(context.supabase, companyId);

    const [progressRes, channelsRes, agentsRes, msgRes] = await Promise.all([
      context.supabase.from("onboarding_progress").select("*").eq("company_id", companyId).single(),
      context.supabase
        .from("channels")
        .select("id, credentials, provider_type", { count: "exact" })
        .eq("company_id", companyId),
      context.supabase.from("ai_agents").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      context.supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("direction", "outbound"),
    ]);

    const channels = channelsRes.data ?? [];
    const connected = channels.filter((c) => {
      const creds = (c.credentials ?? {}) as Record<string, unknown>;
      return c.provider_type === "whatsapp_cloud" && creds.phone_number_id && creds.access_token;
    }).length;

    const totals = {
      channels: channelsRes.count ?? channels.length,
      connectedChannels: connected,
      agents: agentsRes.count ?? 0,
      outboundMessages: msgRes.count ?? 0,
    };

    const current = progressRes.data as OnboardingProgress;
    const step_channel_created = current.step_channel_created || totals.channels > 0;
    const step_whatsapp_connected = current.step_whatsapp_connected || totals.connectedChannels > 0;
    const step_agent_created = current.step_agent_created || totals.agents > 0;
    const step_first_message_sent = current.step_first_message_sent || totals.outboundMessages > 0;

    const allDone = step_channel_created && step_whatsapp_connected && step_agent_created && step_first_message_sent;
    const completed_at = allDone && !current.completed_at ? new Date().toISOString() : current.completed_at;

    const changed =
      step_channel_created !== current.step_channel_created ||
      step_whatsapp_connected !== current.step_whatsapp_connected ||
      step_agent_created !== current.step_agent_created ||
      step_first_message_sent !== current.step_first_message_sent ||
      (allDone && !current.completed_at);

    if (changed) {
      await context.supabase
        .from("onboarding_progress")
        .update({
          step_channel_created,
          step_whatsapp_connected,
          step_agent_created,
          step_first_message_sent,
          completed_at,
        })
        .eq("company_id", companyId);
    }

    const merged: OnboardingProgress = {
      ...current,
      step_channel_created,
      step_whatsapp_connected,
      step_agent_created,
      step_first_message_sent,
      completed_at,
    };
    const doneCount = [step_channel_created, step_whatsapp_connected, step_agent_created, step_first_message_sent].filter(Boolean).length;
    return { progress: merged, totals, percent: Math.round((doneCount / 4) * 100) };
  });

export const setOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { step: string; value?: boolean }) => stepSchema.parse(input))
  .handler(async ({ data, context }) => {
    const companyId = await loadCompanyId(context.supabase, context.userId);
    await ensureRow(context.supabase, companyId);
    const value = data.value ?? true;
    const patch: Record<string, boolean> = { [data.step]: value };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (context.supabase as any)
      .from("onboarding_progress")
      .update(patch)
      .eq("company_id", companyId);
    return { ok: true };
  });

export const dismissOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await loadCompanyId(context.supabase, context.userId);
    await ensureRow(context.supabase, companyId);
    await context.supabase
      .from("onboarding_progress")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("company_id", companyId);
    return { ok: true };
  });
