import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/rbac/guard";

async function currentCompanyId(context: { supabase: any; userId: string }): Promise<string> {
  const { data } = await context.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await currentCompanyId(context);

    const [membersRes, rolesRes, invitesRes] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", companyId),
      context.supabase
        .from("pending_invites")
        .select("id, email, role, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);

    const roleByUser = new Map<string, string>();
    for (const r of (rolesRes.data ?? []) as Array<{ user_id: string; role: string }>) {
      roleByUser.set(r.user_id, r.role);
    }

    const members = ((membersRes.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
      created_at: string;
    }>).map((m) => ({
      ...m,
      role: roleByUser.get(m.id) ?? "agent",
    }));

    return { members, invites: invitesRes.data ?? [] };
  });

async function audit(ctx: { supabase: any; userId: string }, companyId: string, action: string, entity?: string, entityId?: string, diff?: any) {
  await ctx.supabase.from("team_audit_log").insert({
    company_id: companyId, actor_id: ctx.userId, action, entity, entity_id: entityId ?? null, diff: diff ?? null,
  });
}

function newInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const createDirectTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      password: string;
      fullName: string;
      role: "admin" | "agent";
      jobTitle?: string;
      departmentId?: string;
    }) =>
      z
        .object({
          email: z.string().email("Formato de e-mail inválido").max(200),
          password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres").max(100),
          fullName: z.string().trim().min(2, "Informe o nome do membro").max(120),
          role: z.enum(["admin", "agent"]),
          jobTitle: z.string().max(100).optional(),
          departmentId: z.string().uuid().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Criar usuário direto no Supabase Auth com confirmação automática de e-mail
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase().trim(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "Falha ao cadastrar usuário na autenticação");
    }

    const userId = authData.user.id;

    // 2. Associar perfil à empresa
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: data.email.toLowerCase().trim(),
      full_name: data.fullName,
      company_id: companyId,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      throw new Error(`Usuário criado, mas falhou ao atualizar perfil: ${profileError.message}`);
    }

    // 3. Atribuir função/role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("company_id", companyId);
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      company_id: companyId,
      role: data.role,
    });

    if (roleError) {
      throw new Error(`Perfil associado, mas falhou ao atribuir função: ${roleError.message}`);
    }

    // 4. Perfil adicional da equipe (departamento/cargo)
    await supabaseAdmin.from("team_member_profiles").upsert(
      {
        user_id: userId,
        company_id: companyId,
        status: "active",
        job_title: data.jobTitle ?? null,
        department_id: data.departmentId ?? null,
      },
      { onConflict: "user_id" },
    );

    await audit(context, companyId, "member.create_direct", "member", userId, {
      email: data.email,
      role: data.role,
      fullName: data.fullName,
    });

    return {
      ok: true,
      userId,
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      role: data.role,
    };
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; role: "admin" | "agent" }) =>
    z.object({ email: z.string().email().max(200), role: z.enum(["admin", "agent"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const token = newInviteToken();
    const { error, data: row } = await context.supabase
      .from("pending_invites")
      .upsert(
        {
          email: data.email.toLowerCase(),
          role: data.role,
          company_id: companyId,
          invited_by: context.userId,
          token,
          status: "pending",
          expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
          last_sent_at: new Date().toISOString(),
          sent_count: 1,
        },
        { onConflict: "email,company_id" },
      )
      .select().single();
    if (error) throw new Error(error.message);
    await audit(context, companyId, "invite.create", "invite", row?.id, { email: data.email, role: data.role });
    return { ok: true, id: row?.id, token: row?.token };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const token = newInviteToken();
    const { data: inv } = await context.supabase.from("pending_invites").select("sent_count").eq("id", data.id).maybeSingle();
    const { error, data: row } = await context.supabase.from("pending_invites")
      .update({
        token,
        status: "pending",
        expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        last_sent_at: new Date().toISOString(),
        sent_count: (inv?.sent_count ?? 0) + 1,
      })
      .eq("id", data.id).eq("company_id", companyId).select().single();
    if (error) throw new Error(error.message);
    await audit(context, companyId, "invite.resend", "invite", data.id, { sent_count: row?.sent_count });
    return { ok: true, token: row?.token };
  });

export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const { error } = await context.supabase.from("pending_invites")
      .update({ status: "cancelled" }).eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await audit(context, companyId, "invite.cancel", "invite", data.id);
    return { ok: true };
  });

export const acceptInviteByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => z.object({ token: z.string().min(10) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("accept_invite_token", { _token: data.token });
    if (error) throw new Error(error.message);
    return res;
  });

export const previewInvite = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => z.object({ token: z.string().min(10).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(process.env.SUPABASE_URL!, key, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      } },
    });
    // SECURITY: anon cannot read pending_invites directly. Use the SECURITY DEFINER
    // RPC that returns only minimal fields for the exact token (no enumeration).
    const { data: rows, error } = await (sb as any).rpc("preview_invite_by_token", { _token: data.token });
    if (error) return { found: false as const };
    const inv = Array.isArray(rows) ? rows[0] : rows;
    if (!inv || !inv.found) return { found: false as const };
    return {
      found: true as const,
      email: inv.email as string,
      role: inv.role as string,
      status: inv.status as string,
      expires_at: inv.expires_at as string,
      company_name: (inv.company_name as string) ?? "Empresa",
      expired: !!inv.expired,
    };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: "admin" | "agent" }) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["admin", "agent"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    }
    // Replace roles for this user in this company
    await context.supabase.from("user_roles").delete().eq("user_id", data.userId).eq("company_id", companyId);
    const { error } = await context.supabase.from("user_roles")
      .insert({ user_id: data.userId, company_id: companyId, role: data.role });
    if (error) throw new Error(error.message);
    await audit(context, companyId, "member.role.update", "member", data.userId, { role: data.role });
    return { ok: true };
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; status: "active" | "inactive" | "archived" }) =>
    z.object({ userId: z.string().uuid(), status: z.enum(["active","inactive","archived"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    if (data.userId === context.userId && data.status !== "active") {
      throw new Error("Você não pode desativar a si mesmo.");
    }
    const { error } = await (context.supabase as any).from("team_member_profiles")
      .upsert({
        user_id: data.userId, company_id: companyId, status: data.status,
        deactivated_at: data.status === "active" ? null : new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    await audit(context, companyId, "member.status.update", "member", data.userId, { status: data.status });
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo.");
    const { error } = await context.supabase.from("user_roles").delete()
      .eq("user_id", data.userId).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    // Archive (soft) member profile
    await (context.supabase as any).from("team_member_profiles")
      .update({ status: "archived", deactivated_at: new Date().toISOString() })
      .eq("user_id", data.userId).eq("company_id", companyId);
    await audit(context, companyId, "member.remove", "member", data.userId);
    return { ok: true };
  });

export const setMemberTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; tags: string[] }) =>
    z.object({ userId: z.string().uuid(), tags: z.array(z.string().max(40)).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const { error } = await (context.supabase as any).from("team_member_profiles")
      .upsert({ user_id: data.userId, company_id: companyId, tags: data.tags }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    await audit(context, companyId, "member.tags.update", "member", data.userId, { tags: data.tags });
    return { ok: true };
  });
