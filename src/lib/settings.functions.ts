import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/rbac/guard";

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, company_id, full_name, email, avatar_url, notification_prefs")
      .eq("id", context.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Perfil não encontrado");

    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("id, name, timezone, locale, logo_url")
      .eq("id", profile.company_id as string)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);

    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      profile,
      company,
      role: (role?.role as string | undefined) ?? "agent",
    };
  });

export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; timezone: string; locale: string }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        timezone: z.string().min(1).max(80),
        locale: z.string().min(2).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context, "Somente administradores podem editar a workspace.");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    const { error } = await context.supabase
      .from("companies")
      .update({ name: data.name, timezone: data.timezone, locale: data.locale })
      .eq("id", profile.company_id as string);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { full_name: string; avatar_url?: string | null }) =>
    z
      .object({
        full_name: z.string().min(1).max(120),
        avatar_url: z.string().url().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.full_name, avatar_url: data.avatar_url ?? null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prefs: Record<string, boolean> }) =>
    z.object({ prefs: z.record(z.string(), z.boolean()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ notification_prefs: data.prefs })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getIntegrationsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    resend: {
      configured: Boolean(process.env.RESEND_API_KEY),
      from: process.env.RESEND_FROM_EMAIL ?? null,
    },
    lovableAI: {
      configured: Boolean(process.env.LOVABLE_API_KEY),
    },
  }));
