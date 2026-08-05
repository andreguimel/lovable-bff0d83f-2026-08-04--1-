import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/rbac/guard";

async function currentCompanyId(context: { supabase: any; userId: string }): Promise<string> {
  const { data } = await context.supabase
    .from("profiles").select("company_id").eq("id", context.userId).maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

/** Effective permissions of current user (role + overrides + admin default). */
export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_effective_permissions");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ permission_key: string; source: string; granted: boolean }>;
  });

/** Full registry of permissions from DB. */
export const listPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("permissions").select("*").order("module").order("action");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Grants configured for each role in the current company. */
export const listRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await currentCompanyId(context);
    const { data, error } = await context.supabase
      .from("role_permissions_v2").select("*").eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertSchema = z.object({
  role: z.enum(["admin", "agent"]),
  grants: z.array(z.object({ permission_key: z.string(), granted: z.boolean() })),
});

export const updateRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof upsertSchema>) => upsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const correlationId = crypto.randomUUID();

    const rows = data.grants.map((g) => ({
      company_id: companyId,
      role: data.role,
      permission_key: g.permission_key,
      granted: g.granted,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await context.supabase
      .from("role_permissions_v2")
      .upsert(rows, { onConflict: "company_id,role,permission_key" });
    if (error) throw new Error(error.message);

    await context.supabase.from("team_audit_log").insert({
      company_id: companyId,
      actor_id: context.userId,
      action: "rbac.role_permissions_updated",
      entity: "role",
      entity_id: null,
      diff: { role: data.role, count: data.grants.length },
      correlation_id: correlationId,
    });
    await context.supabase.from("domain_events").insert({
      company_id: companyId,
      event_type: "RolePermissionsChanged",
      aggregate_type: "role",
      payload: { role: data.role, grants: data.grants },
      actor_id: context.userId,
      correlation_id: correlationId,
    });

    return { ok: true, correlation_id: correlationId };
  });

/** Member overrides listing + upsert. */
export const listMemberOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const companyId = await currentCompanyId(context);
    const { data: rows, error } = await context.supabase
      .from("member_permission_overrides")
      .select("*")
      .eq("company_id", companyId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const overrideSchema = z.object({
  userId: z.string().uuid(),
  overrides: z.array(z.object({
    permission_key: z.string(),
    granted: z.boolean(),
    reason: z.string().max(500).optional(),
  })),
});

export const updateMemberOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof overrideSchema>) => overrideSchema.parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const correlationId = crypto.randomUUID();

    const rows = data.overrides.map((o) => ({
      company_id: companyId,
      user_id: data.userId,
      permission_key: o.permission_key,
      granted: o.granted,
      reason: o.reason ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await context.supabase
      .from("member_permission_overrides")
      .upsert(rows, { onConflict: "company_id,user_id,permission_key" });
    if (error) throw new Error(error.message);

    await context.supabase.from("team_audit_log").insert({
      company_id: companyId,
      actor_id: context.userId,
      action: "rbac.member_overrides_updated",
      entity: "member", entity_id: data.userId,
      diff: { count: data.overrides.length },
      correlation_id: correlationId,
    });

    return { ok: true, correlation_id: correlationId };
  });

/** Effective permissions for a specific member (herança + override). */
export const getMemberEffectivePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const companyId = await currentCompanyId(context);
    const [permsRes, rolesRes, rolePermsRes, overridesRes] = await Promise.all([
      context.supabase.from("permissions").select("*"),
      context.supabase.from("user_roles").select("role")
        .eq("user_id", data.userId).eq("company_id", companyId).maybeSingle(),
      context.supabase.from("role_permissions_v2").select("*").eq("company_id", companyId),
      context.supabase.from("member_permission_overrides").select("*")
        .eq("user_id", data.userId).eq("company_id", companyId),
    ]);
    if (permsRes.error) throw new Error(permsRes.error.message);
    const role = rolesRes.data?.role ?? "agent";
    const rolePermByKey = new Map<string, boolean>();
    for (const r of rolePermsRes.data ?? []) {
      if (r.role === role) rolePermByKey.set(r.permission_key, r.granted);
    }
    const overrideByKey = new Map<string, { granted: boolean; reason?: string }>();
    for (const o of overridesRes.data ?? []) {
      overrideByKey.set(o.permission_key, { granted: o.granted, reason: o.reason ?? undefined });
    }

    return (permsRes.data ?? []).map((p: any) => {
      const inherited = rolePermByKey.has(p.key) ? rolePermByKey.get(p.key)!
        : role === "admin";
      const ov = overrideByKey.get(p.key);
      const effective = ov ? ov.granted : inherited;
      return {
        ...p,
        role,
        inherited,
        override: ov ?? undefined,
        effective,
      };
    });
  });
