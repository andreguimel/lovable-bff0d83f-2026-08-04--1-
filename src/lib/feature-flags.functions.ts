import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin as requireAdminGuard } from "@/lib/rbac/guard";

async function currentCompanyId(context: { supabase: any; userId: string }): Promise<string> {
  const { data } = await context.supabase
    .from("profiles").select("company_id").eq("id", context.userId).maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

const requireAdmin = (context: { supabase: any; userId: string }) =>
  requireAdminGuard(context, "FF_403: apenas administradores gerenciam feature flags.");

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await currentCompanyId(context);
    const { data, error } = await context.supabase
      .from("feature_flags").select("*")
      .eq("company_id", companyId)
      .order("module", { ascending: true, nullsFirst: false })
      .order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const flagSchema = z.object({
  key: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  module: z.string().max(60).optional(),
  environment: z.enum(["dev", "staging", "prod", "all"]).default("all"),
  strategy: z.enum(["boolean", "percentage", "role", "user"]).default("boolean"),
  enabled: z.boolean().default(false),
  rollout_percentage: z.number().min(0).max(100).default(100),
  target_roles: z.array(z.string()).optional(),
  target_users: z.array(z.string().uuid()).optional(),
  depends_on: z.array(z.string()).optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

export const upsertFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof flagSchema>) => flagSchema.parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const correlationId = crypto.randomUUID();

    // Dependency check
    if (data.depends_on?.length) {
      const { data: deps } = await context.supabase
        .from("feature_flags").select("key,enabled")
        .eq("company_id", companyId)
        .in("key", data.depends_on);
      const missing = data.depends_on.filter((k) => !deps?.find((d: any) => d.key === k));
      if (missing.length) throw new Error(`FF_002: dependências ausentes: ${missing.join(", ")}`);
    }

    const row = {
      ...data,
      company_id: companyId,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await context.supabase
      .from("feature_flags")
      .upsert(row, { onConflict: "company_id,key" })
      .select().single();
    if (error) throw new Error(error.message);

    await context.supabase.from("team_audit_log").insert({
      company_id: companyId, actor_id: context.userId,
      action: "feature_flag.upserted", entity: "feature_flag", entity_id: saved.id,
      diff: data, correlation_id: correlationId,
    });
    await context.supabase.from("domain_events").insert({
      company_id: companyId, event_type: "FeatureFlagChanged",
      aggregate_type: "feature_flag", aggregate_id: saved.id,
      payload: data, actor_id: context.userId, correlation_id: correlationId,
    });

    return saved;
  });

export const deleteFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const { error } = await context.supabase
      .from("feature_flags").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await context.supabase.from("team_audit_log").insert({
      company_id: companyId, actor_id: context.userId,
      action: "feature_flag.deleted", entity: "feature_flag", entity_id: data.id,
    });
    return { ok: true };
  });

export const evaluateFeatureFlag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { key: string }) => z.object({ key: z.string() }).parse(i))
  .handler(async ({ context, data }) => {
    const companyId = await currentCompanyId(context);
    const { data: flag } = await context.supabase
      .from("feature_flags").select("*")
      .eq("company_id", companyId).eq("key", data.key).maybeSingle();
    if (!flag) return { enabled: false, reason: "not_found" };
    if (!flag.enabled) return { enabled: false, reason: "disabled" };
    if (flag.expires_at && new Date(flag.expires_at) < new Date())
      return { enabled: false, reason: "expired" };

    if (flag.strategy === "boolean") return { enabled: true, reason: "boolean" };
    if (flag.strategy === "percentage") {
      const bucket = hashPercent(context.userId + data.key);
      return { enabled: bucket < (flag.rollout_percentage ?? 100), reason: "percentage" };
    }
    if (flag.strategy === "user" && flag.target_users?.length)
      return { enabled: flag.target_users.includes(context.userId), reason: "user" };
    if (flag.strategy === "role" && flag.target_roles?.length) {
      const { data: ur } = await context.supabase
        .from("user_roles").select("role")
        .eq("user_id", context.userId).eq("company_id", companyId).maybeSingle();
      return { enabled: !!ur?.role && flag.target_roles.includes(ur.role), reason: "role" };
    }
    return { enabled: true, reason: "default" };
  });

function hashPercent(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return Math.abs(h) % 100;
}
