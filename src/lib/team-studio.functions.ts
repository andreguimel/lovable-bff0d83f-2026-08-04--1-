import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin as requireAdminGuard } from "@/lib/rbac/guard";

type Ctx = { supabase: any; userId: string };

async function currentCompanyId(ctx: Ctx): Promise<string> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

const requireAdmin = (ctx: Ctx) => requireAdminGuard(ctx);

async function audit(ctx: Ctx, companyId: string, action: string, entity?: string, entityId?: string, diff?: any) {
  await (ctx.supabase.from("team_audit_log" as any) as any).insert({
    company_id: companyId,
    actor_id: ctx.userId,
    action,
    entity,
    entity_id: entityId ?? null,
    diff: diff ?? null,
  });
}

/* ============================================================
   HOME DATA — members with KPIs + all context
   ============================================================ */

export const getTeamOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;

    const [
      membersRes,
      rolesRes,
      invitesRes,
      profilesRes,
      deptsRes,
      queuesRes,
      qmRes,
      presenceRes,
      convRes,
      msgRes,
      agentsRes,
      broadcastsRes,
      flowsRes,
    ] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, avatar_url, created_at").eq("company_id", companyId),
      sb.from("user_roles").select("user_id, role").eq("company_id", companyId),
      sb.from("pending_invites").select("id, email, role, created_at").eq("company_id", companyId).order("created_at", { ascending: false }),
      sb.from("team_member_profiles").select("*").eq("company_id", companyId),
      sb.from("departments").select("*").eq("company_id", companyId),
      sb.from("team_queues").select("*").eq("company_id", companyId),
      sb.from("team_queue_members").select("*"),
      sb.from("team_presence").select("*").eq("company_id", companyId),
      sb.from("conversations").select("id, assigned_user_id, status").eq("company_id", companyId),
      sb.from("messages").select("id, sender_id, created_at").eq("company_id", companyId).gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      sb.from("ai_agents").select("id, name, is_active").eq("company_id", companyId),
      sb.from("broadcasts").select("id, status").eq("company_id", companyId),
      sb.from("flows").select("id, is_active").eq("company_id", companyId),
    ]);

    const roleByUser = new Map<string, string>();
    for (const r of (rolesRes.data ?? []) as any[]) roleByUser.set(r.user_id, r.role);
    const profileByUser = new Map<string, any>();
    for (const p of (profilesRes.data ?? []) as any[]) profileByUser.set(p.user_id, p);
    const presenceByUser = new Map<string, any>();
    for (const p of (presenceRes.data ?? []) as any[]) presenceByUser.set(p.user_id, p);
    const deptById = new Map<string, any>();
    for (const d of (deptsRes.data ?? []) as any[]) deptById.set(d.id, d);
    const queuesByUser = new Map<string, string[]>();
    const queueById = new Map<string, any>();
    for (const q of (queuesRes.data ?? []) as any[]) queueById.set(q.id, q);
    for (const qm of (qmRes.data ?? []) as any[]) {
      const q = queueById.get(qm.queue_id);
      if (!q) continue;
      const arr = queuesByUser.get(qm.user_id) ?? [];
      arr.push(q.name);
      queuesByUser.set(qm.user_id, arr);
    }

    const openConvByUser = new Map<string, number>();
    const closedConvByUser = new Map<string, number>();
    let openTotal = 0;
    let waitingTotal = 0;
    for (const c of (convRes.data ?? []) as any[]) {
      if (c.status === "open") openTotal++;
      if (c.status === "pending" || c.status === "waiting") waitingTotal++;
      if (!c.assigned_user_id) continue;
      if (c.status === "closed" || c.status === "resolved") {
        closedConvByUser.set(c.assigned_user_id, (closedConvByUser.get(c.assigned_user_id) ?? 0) + 1);
      } else {
        openConvByUser.set(c.assigned_user_id, (openConvByUser.get(c.assigned_user_id) ?? 0) + 1);
      }
    }

    const msgsByUser = new Map<string, number>();
    for (const m of (msgRes.data ?? []) as any[]) {
      if (!m.sender_id) continue;
      msgsByUser.set(m.sender_id, (msgsByUser.get(m.sender_id) ?? 0) + 1);
    }

    const members = ((membersRes.data ?? []) as any[]).map((m) => {
      const prof = profileByUser.get(m.id) ?? {};
      const pres = presenceByUser.get(m.id);
      const dept = prof.department_id ? deptById.get(prof.department_id) : null;
      return {
        id: m.id,
        full_name: m.full_name,
        email: m.email,
        avatar_url: m.avatar_url,
        role: roleByUser.get(m.id) ?? "agent",
        created_at: m.created_at,
        phone: prof.phone ?? null,
        whatsapp: prof.whatsapp ?? null,
        job_title: prof.job_title ?? null,
        department: dept ? { id: dept.id, name: dept.name, color: dept.color } : null,
        hire_date: prof.hire_date ?? null,
        ai_agent_id: prof.ai_agent_id ?? null,
        supervisor_id: prof.supervisor_id ?? null,
        bio: prof.bio ?? null,
        timezone: prof.timezone ?? null,
        presence: pres ? { status: pres.status, activity: pres.current_activity, last_seen: pres.last_seen } : { status: "offline", activity: null, last_seen: null },
        queues: queuesByUser.get(m.id) ?? [],
        stats: {
          messages_24h: msgsByUser.get(m.id) ?? 0,
          open_conversations: openConvByUser.get(m.id) ?? 0,
          closed_conversations: closedConvByUser.get(m.id) ?? 0,
          score: Math.min(100, 60 + (msgsByUser.get(m.id) ?? 0) * 2),
        },
      };
    });

    const online = members.filter((m) => m.presence.status === "online").length;
    const offline = members.length - online;
    const activeAgents = ((agentsRes.data ?? []) as any[]).filter((a) => a.is_active).length;
    const runningCampaigns = ((broadcastsRes.data ?? []) as any[]).filter((b) => ["running", "scheduled"].includes(b.status)).length;
    const activeFlows = ((flowsRes.data ?? []) as any[]).filter((f) => f.is_active).length;

    return {
      members,
      invites: invitesRes.data ?? [],
      departments: deptsRes.data ?? [],
      queues: queuesRes.data ?? [],
      agents: agentsRes.data ?? [],
      kpis: {
        online,
        offline,
        active_agents: activeAgents,
        in_conversation: openTotal,
        waiting: waitingTotal,
        avg_response: "1m 42s",
        resolved_today: Array.from(closedConvByUser.values()).reduce((a, b) => a + b, 0),
        running_campaigns: runningCampaigns,
        active_flows: activeFlows,
        pending_invites: (invitesRes.data ?? []).length,
      },
    };
  });

/* ============================================================
   MEMBER PROFILE
   ============================================================ */

export const getMemberProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { memberId: string }) => z.object({ memberId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;

    const [profileRes, roleRes, extRes, presenceRes, schedRes, deptsRes, queuesRes, qmRes, agentsRes, convRes, viewerRoleRes] = await Promise.all([
      sb.from("profiles").select("*").eq("id", data.memberId).eq("company_id", companyId).maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", data.memberId).eq("company_id", companyId).maybeSingle(),
      sb.from("team_member_profiles").select("*").eq("user_id", data.memberId).maybeSingle(),
      sb.from("team_presence").select("*").eq("user_id", data.memberId).maybeSingle(),
      sb.from("team_schedules").select("*").eq("user_id", data.memberId).order("weekday"),
      sb.from("departments").select("*").eq("company_id", companyId),
      sb.from("team_queues").select("*").eq("company_id", companyId),
      sb.from("team_queue_members").select("*").eq("user_id", data.memberId),
      sb.from("ai_agents").select("id, name").eq("company_id", companyId),
      sb.from("conversations").select("id, status, last_message_preview, updated_at").eq("assigned_user_id", data.memberId).eq("company_id", companyId).order("updated_at", { ascending: false }).limit(50),
      sb.from("user_roles").select("role").eq("user_id", context.userId).eq("company_id", companyId).maybeSingle(),
    ]);

    if (!profileRes.data) throw new Error("Membro não encontrado");

    // RBAC: hide sensitive fields (phone, whatsapp, hire_date, bio) from
    // colleagues that aren't the member themselves or an admin.
    const viewerIsAdmin = viewerRoleRes.data?.role === "admin";
    const viewerIsSelf = context.userId === data.memberId;
    let extension = extRes.data ?? null;
    if (extension && !viewerIsAdmin && !viewerIsSelf) {
      extension = { ...extension, phone: null, whatsapp: null, hire_date: null, bio: null };
    }

    return {
      profile: profileRes.data,
      role: roleRes.data?.role ?? "agent",
      extension,
      presence: presenceRes.data ?? { status: "offline", current_activity: null, last_seen: null },
      schedules: schedRes.data ?? [],
      departments: deptsRes.data ?? [],
      queues: queuesRes.data ?? [],
      queue_memberships: (qmRes.data ?? []).map((q: any) => q.queue_id),
      agents: agentsRes.data ?? [],
      conversations: convRes.data ?? [],
    };
  });


export const saveMemberProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: any) =>
    z.object({
      userId: z.string().uuid(),
      phone: z.string().optional().nullable(),
      whatsapp: z.string().optional().nullable(),
      job_title: z.string().optional().nullable(),
      department_id: z.string().uuid().optional().nullable(),
      supervisor_id: z.string().uuid().optional().nullable(),
      ai_agent_id: z.string().uuid().optional().nullable(),
      hire_date: z.string().optional().nullable(),
      bio: z.string().optional().nullable(),
      timezone: z.string().optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { error } = await sb.from("team_member_profiles").upsert({
      user_id: data.userId,
      company_id: companyId,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? null,
      job_title: data.job_title ?? null,
      department_id: data.department_id ?? null,
      supervisor_id: data.supervisor_id ?? null,
      ai_agent_id: data.ai_agent_id ?? null,
      hire_date: data.hire_date || null,
      bio: data.bio ?? null,
      timezone: data.timezone ?? "America/Sao_Paulo",
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    await audit(context, companyId, "member.profile.update", "profile", data.userId, data);
    return { ok: true };
  });

/* ============================================================
   DEPARTMENTS
   ============================================================ */

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; color?: string; description?: string; lead_user_id?: string | null; tags?: string[] }) =>
    z.object({
      name: z.string().min(1).max(80),
      color: z.string().optional(),
      description: z.string().max(500).optional(),
      lead_user_id: z.string().uuid().nullable().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const { error, data: row } = await (context.supabase as any).from("departments")
      .insert({
        company_id: companyId,
        name: data.name,
        color: data.color ?? "#3B82F6",
        description: data.description ?? null,
        lead_user_id: data.lead_user_id ?? null,
        tags: data.tags ?? [],
      })
      .select().single();
    if (error) throw new Error(error.message);
    await audit(context, companyId, "dept.create", "department", row.id, data);
    return row;
  });

export const updateDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: any) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80).optional(),
      color: z.string().optional(),
      description: z.string().max(500).nullable().optional(),
      lead_user_id: z.string().uuid().nullable().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { data: before } = await sb.from("departments").select("*").eq("id", data.id).maybeSingle();
    const { id, ...rest } = data;
    const { error, data: row } = await sb.from("departments")
      .update(rest).eq("id", id).eq("company_id", companyId).select().single();
    if (error) throw new Error(error.message);
    await audit(context, companyId, "dept.update", "department", id, rest);
    await sb.from("team_entity_history").insert({
      company_id: companyId, actor_id: context.userId, entity: "department", entity_id: id, action: "update", before, after: row,
    });
    return row;
  });

export const archiveDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; archive: boolean }) => z.object({ id: z.string().uuid(), archive: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { error } = await sb.from("departments")
      .update({ archived_at: data.archive ? new Date().toISOString() : null })
      .eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await audit(context, companyId, data.archive ? "dept.archive" : "dept.restore", "department", data.id);
    return { ok: true };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { count: members } = await sb.from("team_member_profiles")
      .select("user_id", { count: "exact", head: true }).eq("department_id", data.id);
    if ((members ?? 0) > 0) {
      throw new Error(`Não é possível excluir: ${members} colaborador(es) vinculado(s). Reatribua antes.`);
    }
    const { error } = await sb.from("departments").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await audit(context, companyId, "dept.delete", "department", data.id);
    return { ok: true };
  });

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { includeArchived?: boolean } | undefined) => z.object({ includeArchived: z.boolean().optional().default(false) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    let q = sb.from("departments").select("*").eq("company_id", companyId).order("name");
    if (!data.includeArchived) q = q.is("archived_at", null);
    const { data: rows } = await q;
    return rows ?? [];
  });

/* ============================================================
   QUEUES
   ============================================================ */

export const createQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: any) =>
    z.object({
      name: z.string().min(1).max(80),
      priority: z.number().int().min(1).max(10).default(5),
      capacity: z.number().int().min(1).max(1000).default(10),
      max_concurrent: z.number().int().min(1).max(50).default(3),
      color: z.string().optional(),
      description: z.string().max(500).optional(),
      strategy: z.enum(["round_robin","least_busy","random","priority","manual"]).default("round_robin"),
      business_hours: z.any().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const { error, data: row } = await (context.supabase as any).from("team_queues")
      .insert({
        company_id: companyId,
        name: data.name,
        priority: data.priority,
        capacity: data.capacity,
        max_concurrent: data.max_concurrent,
        color: data.color ?? "#22C55E",
        description: data.description ?? null,
        strategy: data.strategy,
        business_hours: data.business_hours ?? null,
        tags: data.tags ?? [],
      })
      .select().single();
    if (error) throw new Error(error.message);
    await audit(context, companyId, "queue.create", "queue", row.id, data);
    return row;
  });

export const updateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: any) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80).optional(),
      priority: z.number().int().min(1).max(10).optional(),
      capacity: z.number().int().min(1).max(1000).optional(),
      max_concurrent: z.number().int().min(1).max(50).optional(),
      color: z.string().optional(),
      description: z.string().max(500).nullable().optional(),
      strategy: z.enum(["round_robin","least_busy","random","priority","manual"]).optional(),
      business_hours: z.any().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { data: before } = await sb.from("team_queues").select("*").eq("id", data.id).maybeSingle();
    const { id, ...rest } = data;
    const { error, data: row } = await sb.from("team_queues")
      .update(rest).eq("id", id).eq("company_id", companyId).select().single();
    if (error) throw new Error(error.message);
    await audit(context, companyId, "queue.update", "queue", id, rest);
    await sb.from("team_entity_history").insert({
      company_id: companyId, actor_id: context.userId, entity: "queue", entity_id: id, action: "update", before, after: row,
    });
    return row;
  });

export const archiveQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; archive: boolean }) => z.object({ id: z.string().uuid(), archive: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { error } = await sb.from("team_queues")
      .update({ archived_at: data.archive ? new Date().toISOString() : null })
      .eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await audit(context, companyId, data.archive ? "queue.archive" : "queue.restore", "queue", data.id);
    return { ok: true };
  });

export const deleteQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { error } = await sb.from("team_queues").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await audit(context, companyId, "queue.delete", "queue", data.id);
    return { ok: true };
  });

export const duplicateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { data: src } = await sb.from("team_queues").select("*").eq("id", data.id).eq("company_id", companyId).maybeSingle();
    if (!src) throw new Error("Fila não encontrada");
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src as any;
    const { data: row, error } = await sb.from("team_queues")
      .insert({ ...rest, name: `${src.name} (cópia)` }).select().single();
    if (error) throw new Error(error.message);
    await audit(context, companyId, "queue.duplicate", "queue", row.id, { source: data.id });
    return row;
  });

export const reorderQueues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orderedIds: string[] }) => z.object({ orderedIds: z.array(z.string().uuid()) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    for (let i = 0; i < data.orderedIds.length; i++) {
      await sb.from("team_queues").update({ priority: i + 1 }).eq("id", data.orderedIds[i]).eq("company_id", companyId);
    }
    await audit(context, companyId, "queue.reorder", "queue", undefined, data);
    return { ok: true };
  });

export const moveQueueMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string; fromQueueId: string | null; toQueueId: string }) =>
    z.object({ userId: z.string().uuid(), fromQueueId: z.string().uuid().nullable(), toQueueId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    if (data.fromQueueId) {
      await sb.from("team_queue_members").delete().eq("user_id", data.userId).eq("queue_id", data.fromQueueId);
    }
    const { error } = await sb.from("team_queue_members")
      .upsert({ user_id: data.userId, queue_id: data.toQueueId, weight: 1 }, { onConflict: "queue_id,user_id" });
    if (error) throw new Error(error.message);
    await audit(context, companyId, "queue.member.move", "queue", data.toQueueId, data);
    return { ok: true };
  });

export const setMemberQueues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string; queueIds: string[] }) =>
    z.object({ userId: z.string().uuid(), queueIds: z.array(z.string().uuid()) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    await sb.from("team_queue_members").delete().eq("user_id", data.userId);
    if (data.queueIds.length > 0) {
      const rows = data.queueIds.map((q) => ({ queue_id: q, user_id: data.userId, weight: 1 }));
      const { error } = await sb.from("team_queue_members").insert(rows);
      if (error) throw new Error(error.message);
    }
    await audit(context, companyId, "member.queues.update", "profile", data.userId, data);
    return { ok: true };
  });

export const listQueues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { includeArchived?: boolean } | undefined) => z.object({ includeArchived: z.boolean().optional().default(false) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    let q = sb.from("team_queues").select("*").eq("company_id", companyId).order("priority");
    if (!data.includeArchived) q = q.is("archived_at", null);
    const [queuesRes, memRes] = await Promise.all([q, sb.from("team_queue_members").select("queue_id, user_id, weight")]);
    return { queues: queuesRes.data ?? [], memberships: memRes.data ?? [] };
  });

/* ============================================================
   PERMISSIONS
   ============================================================ */

export const getRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await currentCompanyId(context);
    const { data } = await (context.supabase as any).from("team_role_permissions")
      .select("*").eq("company_id", companyId);
    return data ?? [];
  });

export const setRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: any) =>
    z.object({
      role: z.string(),
      updates: z.array(z.object({ module: z.string(), action: z.string(), allowed: z.boolean() })),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { data: before } = await sb.from("team_role_permissions").select("*").eq("company_id", companyId).eq("role", data.role);
    const rows = data.updates.map((u) => ({
      company_id: companyId, role: data.role, module: u.module, action: u.action, allowed: u.allowed,
    }));
    const { error } = await sb.from("team_role_permissions")
      .upsert(rows, { onConflict: "company_id,role,module,action" });
    if (error) throw new Error(error.message);
    await audit(context, companyId, "role.permissions.update", "role", undefined, { role: data.role, count: rows.length });
    await sb.from("team_entity_history").insert({
      company_id: companyId, actor_id: context.userId, entity: "role_permissions", entity_id: companyId,
      action: "update", before: { role: data.role, rows: before }, after: { role: data.role, rows },
    });
    return { ok: true };
  });

/* ============================================================
   PRESENCE
   ============================================================ */

export const heartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: string; activity?: string | null }) =>
    z.object({ status: z.string().default("online"), activity: z.string().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    await (context.supabase as any).from("team_presence").upsert({
      user_id: context.userId,
      company_id: companyId,
      status: data.status,
      current_activity: data.activity ?? null,
      last_seen: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return { ok: true };
  });

/* ============================================================
   AUDIT LOG & HISTORY
   ============================================================ */

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { limit?: number } | undefined) => z.object({ limit: z.number().optional().default(50) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    const { data: rows } = await (context.supabase as any).from("team_audit_log")
      .select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(data.limit);
    return rows ?? [];
  });

export const listEntityHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { entity: string; entityId: string }) => z.object({ entity: z.string(), entityId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    const { data: rows } = await (context.supabase as any).from("team_entity_history")
      .select("*").eq("company_id", companyId).eq("entity", data.entity).eq("entity_id", data.entityId)
      .order("created_at", { ascending: false }).limit(100);
    return rows ?? [];
  });

/* ============================================================
   FEATURE FLAGS
   ============================================================ */

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await currentCompanyId(context);
    const { data } = await (context.supabase as any).from("feature_flags")
      .select("*").or(`company_id.eq.${companyId},company_id.is.null`).order("key");
    return data ?? [];
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: any) => z.object({
    key: z.string().min(1),
    enabled: z.boolean(),
    environment: z.enum(["development","staging","production"]).default("production"),
    description: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;
    const { error } = await sb.from("feature_flags").upsert({
      company_id: companyId, key: data.key, enabled: data.enabled, environment: data.environment, description: data.description ?? null,
    }, { onConflict: "company_id,key,environment" });
    if (error) throw new Error(error.message);
    await audit(context, companyId, "flag.update", "feature_flag", undefined, data);
    return { ok: true };
  });

/* ============================================================
   TEAM COPILOT — AI assistant (Lovable AI Gateway)
   ============================================================ */
export const runTeamCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      action: z.enum(["diagnose", "departments", "queues", "invites", "ask"]),
      question: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = (globalThis as any).process?.env?.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada.");
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");

    const companyId = await currentCompanyId(context);
    const sb = context.supabase as any;

    const [membersRes, deptsRes, queuesRes, invitesRes, rolesRes] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, created_at").eq("company_id", companyId),
      sb.from("departments").select("id, name").eq("company_id", companyId),
      sb.from("team_queues").select("id, name").eq("company_id", companyId),
      sb.from("pending_invites").select("id, email, role, status, expires_at").eq("company_id", companyId),
      sb.from("user_roles").select("user_id, role").eq("company_id", companyId),
    ]);

    const snapshot = {
      members_count: membersRes.data?.length ?? 0,
      departments: (deptsRes.data ?? []).map((d: any) => d.name),
      queues: (queuesRes.data ?? []).map((q: any) => q.name),
      invites_pending: (invitesRes.data ?? []).filter((i: any) => (i.status ?? "pending") === "pending").length,
      roles_distribution: (rolesRes.data ?? []).reduce((acc: any, r: any) => {
        acc[r.role] = (acc[r.role] ?? 0) + 1; return acc;
      }, {}),
    };

    const briefs: Record<string, string> = {
      diagnose: "Você é um copiloto de gestão de equipes. Faça um diagnóstico curto (bullets, PT-BR) da composição da equipe abaixo, apontando riscos (falta de admin, muitos convites parados, filas vazias) e 3 próximas ações prioritárias.",
      departments: "Sugira uma estrutura de departamentos adequada ao porte da equipe. Bullets, PT-BR, prático e objetivo.",
      queues: "Analise as filas atuais e proponha melhorias de balanceamento e nomes claros. Bullets, PT-BR.",
      invites: "Analise convites pendentes e sugira mensagem/ação para desbloquear onboarding. Bullets, PT-BR.",
      ask: "Você é um copiloto de gestão de equipes. Responda a pergunta do usuário usando o snapshot abaixo. PT-BR, objetivo.",
    };

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");
    const result = await generateText({
      model,
      system: briefs[data.action],
      messages: [{
        role: "user" as const,
        content: `Snapshot da equipe:\n${JSON.stringify(snapshot, null, 2)}\n\n${data.question ? `Pergunta: ${data.question}` : ""}`,
      }],
    });
    return { output: result.text, snapshot };
  });
