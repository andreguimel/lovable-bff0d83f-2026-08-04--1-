/**
 * ZENDA — FUNIL / KANBAN FINALIZATION 01
 * Server functions for funnels, stages, cards (opportunities) and history.
 *
 * Contratos:
 *  - Todo acesso é escopado por company via RLS + validações explícitas.
 *  - Card = oportunidade vinculada a UM contact canônico (não duplica identidade).
 *  - Regra: 1 card `open` ativo por (funnel_id, contact_id) — imposta por unique index parcial.
 *  - Move valida cross-tenant: card.company_id == stage.company_id == funnel_id do stage.
 *  - Todo move gera evento em funnel_card_events (histórico).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function getCompanyId(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("profiles").select("company_id").eq("id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.company_id) throw new Error("Empresa não encontrada para o usuário.");
  return data.company_id as string;
}

// ============================================================================
// FUNNELS
// ============================================================================

export const listFunnels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const { data, error } = await ctx.supabase
      .from("funnels")
      .select("id, name, description, color, is_default, archived_at, created_at, updated_at")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; description?: string | null; color?: string | null }) =>
    z.object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(500).nullish(),
      color: z.string().trim().max(20).nullish(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);

    const { data: existingCount } = await ctx.supabase
      .from("funnels").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).is("archived_at", null);
    const isFirst = (existingCount ?? 0) === 0;

    const { data: created, error } = await ctx.supabase
      .from("funnels")
      .insert({
        company_id: companyId,
        name: data.name,
        description: data.description ?? null,
        color: data.color ?? "#3B82F6",
        is_default: isFirst,
        created_by: ctx.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; name?: string; description?: string | null; color?: string | null }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(500).nullish(),
      color: z.string().trim().max(20).nullish(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.color !== undefined) patch.color = data.color;
    const { data: updated, error } = await ctx.supabase
      .from("funnels").update(patch)
      .eq("id", data.id).eq("company_id", companyId).select("*").single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const archiveFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const { error } = await ctx.supabase
      .from("funnels").update({ archived_at: new Date().toISOString() })
      .eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// STAGES
// ============================================================================

export const listStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnelId: string }) => z.object({ funnelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const { data: rows, error } = await ctx.supabase
      .from("funnel_stages")
      .select("id, funnel_id, name, color, position, kind, archived_at")
      .eq("funnel_id", data.funnelId).eq("company_id", companyId)
      .is("archived_at", null)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnelId: string; name: string; color?: string; kind?: string }) =>
    z.object({
      funnelId: z.string().uuid(),
      name: z.string().trim().min(1).max(60),
      color: z.string().max(20).optional(),
      kind: z.enum(["open", "won", "lost"]).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    // Validate funnel belongs to company
    const { data: funnel, error: fErr } = await ctx.supabase
      .from("funnels").select("id").eq("id", data.funnelId).eq("company_id", companyId).maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!funnel) throw new Error("Funil não encontrado.");
    // Next position
    const { data: last } = await ctx.supabase
      .from("funnel_stages").select("position")
      .eq("funnel_id", data.funnelId).is("archived_at", null)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const nextPos = ((last?.position as number) ?? -1) + 1;
    const { data: created, error } = await ctx.supabase
      .from("funnel_stages")
      .insert({
        funnel_id: data.funnelId, company_id: companyId,
        name: data.name, color: data.color ?? "#94a3b8",
        kind: data.kind ?? "open", position: nextPos,
      }).select("*").single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; name?: string; color?: string; kind?: string }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(60).optional(),
      color: z.string().max(20).optional(),
      kind: z.enum(["open", "won", "lost"]).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.kind !== undefined) patch.kind = data.kind;
    const { data: updated, error } = await ctx.supabase
      .from("funnel_stages").update(patch)
      .eq("id", data.id).eq("company_id", companyId).select("*").single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const reorderStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnelId: string; orderedIds: string[] }) =>
    z.object({
      funnelId: z.string().uuid(),
      orderedIds: z.array(z.string().uuid()).min(1),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    // Validate all stages belong to funnel/company
    const { data: existing, error: eErr } = await ctx.supabase
      .from("funnel_stages").select("id")
      .eq("funnel_id", data.funnelId).eq("company_id", companyId)
      .in("id", data.orderedIds);
    if (eErr) throw new Error(eErr.message);
    if ((existing?.length ?? 0) !== data.orderedIds.length) {
      throw new Error("Etapa inválida ou de outra empresa.");
    }
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await ctx.supabase
        .from("funnel_stages").update({ position: i })
        .eq("id", data.orderedIds[i]).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const archiveStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    // Block if there are open cards in this stage
    const { data: cards } = await ctx.supabase
      .from("funnel_cards").select("id", { count: "exact", head: true })
      .eq("stage_id", data.id).eq("company_id", companyId)
      .eq("status", "open").is("archived_at", null);
    if ((cards as any)?.length > 0) {
      throw new Error("Mova os cards desta etapa antes de arquivá-la.");
    }
    const { error } = await ctx.supabase
      .from("funnel_stages").update({ archived_at: new Date().toISOString() })
      .eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// CARDS
// ============================================================================

export const listCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnelId: string; search?: string; assignedTo?: string | null }) =>
    z.object({
      funnelId: z.string().uuid(),
      search: z.string().trim().max(120).optional(),
      assignedTo: z.string().uuid().nullish(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);

    let query = ctx.supabase
      .from("funnel_cards")
      .select(`
        id, funnel_id, stage_id, contact_id, assigned_user_id, title,
        value_cents, currency, status, position, created_at, updated_at,
        contact:contacts!inner (
          id, name, phone, phone_canonical, avatar_url, email,
          last_interaction_at, last_inbound_channel_id
        )
      `)
      .eq("company_id", companyId)
      .eq("funnel_id", data.funnelId)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (data.assignedTo) query = query.eq("assigned_user_id", data.assignedTo);
    if (data.search && data.search.length > 0) {
      const term = `%${data.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      query = query.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`, {
        referencedTable: "contact",
      });
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    funnelId: string; contactId: string; stageId?: string | null;
    title?: string | null; valueCents?: number; assignedUserId?: string | null;
  }) =>
    z.object({
      funnelId: z.string().uuid(),
      contactId: z.string().uuid(),
      stageId: z.string().uuid().nullish(),
      title: z.string().trim().max(200).nullish(),
      valueCents: z.number().int().min(0).max(1_000_000_000).optional(),
      assignedUserId: z.string().uuid().nullish(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);

    // Validate contact belongs to company (canonical identity)
    const { data: contact, error: cErr } = await ctx.supabase
      .from("contacts").select("id, company_id").eq("id", data.contactId).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contact || contact.company_id !== companyId) throw new Error("Contato inválido.");

    // Resolve stage: use provided or first stage of funnel
    let stageId = data.stageId ?? null;
    if (!stageId) {
      const { data: firstStage, error: sErr } = await ctx.supabase
        .from("funnel_stages").select("id")
        .eq("funnel_id", data.funnelId).eq("company_id", companyId)
        .is("archived_at", null)
        .order("position", { ascending: true }).limit(1).maybeSingle();
      if (sErr) throw new Error(sErr.message);
      if (!firstStage) throw new Error("O funil não possui etapas.");
      stageId = firstStage.id as string;
    } else {
      const { data: stage } = await ctx.supabase
        .from("funnel_stages").select("id, company_id, funnel_id")
        .eq("id", stageId).maybeSingle();
      if (!stage || stage.company_id !== companyId || stage.funnel_id !== data.funnelId) {
        throw new Error("Etapa inválida.");
      }
    }

    // Insert; unique constraint blocks duplicates
    const { data: created, error } = await ctx.supabase
      .from("funnel_cards")
      .insert({
        company_id: companyId,
        funnel_id: data.funnelId,
        stage_id: stageId,
        contact_id: data.contactId,
        assigned_user_id: data.assignedUserId ?? null,
        title: data.title ?? null,
        value_cents: data.valueCents ?? 0,
        created_by: ctx.userId,
      })
      .select("*")
      .single();
    if (error) {
      if (String(error.message).includes("ux_funnel_cards_active_contact_funnel")) {
        throw new Error("Este contato já possui um card ativo neste funil.");
      }
      throw new Error(error.message);
    }

    await ctx.supabase.from("funnel_card_events").insert({
      card_id: created.id, company_id: companyId, actor_id: ctx.userId,
      event_type: "created", to_stage_id: stageId,
      meta: { value_cents: created.value_cents ?? 0 },
    });

    return created;
  });

export const moveCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; toStageId: string }) =>
    z.object({ id: z.string().uuid(), toStageId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);

    // Load card + destination stage; validate same company & same funnel
    const { data: card, error: cErr } = await ctx.supabase
      .from("funnel_cards").select("id, company_id, funnel_id, stage_id, status")
      .eq("id", data.id).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!card || card.company_id !== companyId) throw new Error("Card inválido.");

    const { data: dest, error: sErr } = await ctx.supabase
      .from("funnel_stages").select("id, company_id, funnel_id, kind")
      .eq("id", data.toStageId).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!dest || dest.company_id !== companyId || dest.funnel_id !== card.funnel_id) {
      throw new Error("Etapa de destino inválida.");
    }
    if (card.stage_id === dest.id) return { ok: true, noop: true };

    const patch: Record<string, unknown> = { stage_id: dest.id };
    let eventType = "moved";
    if (dest.kind === "won") { patch.status = "won"; patch.won_at = new Date().toISOString(); eventType = "won"; }
    else if (dest.kind === "lost") { patch.status = "lost"; patch.lost_at = new Date().toISOString(); eventType = "lost"; }
    else if (card.status !== "open") { patch.status = "open"; patch.won_at = null; patch.lost_at = null; eventType = "reopened"; }

    const { error: uErr } = await ctx.supabase
      .from("funnel_cards").update(patch)
      .eq("id", data.id).eq("company_id", companyId);
    if (uErr) throw new Error(uErr.message);

    await ctx.supabase.from("funnel_card_events").insert({
      card_id: data.id, company_id: companyId, actor_id: ctx.userId,
      event_type: eventType, from_stage_id: card.stage_id, to_stage_id: dest.id,
    });
    return { ok: true };
  });

export const updateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    id: string; title?: string | null; valueCents?: number;
    assignedUserId?: string | null; lostReason?: string | null;
  }) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().max(200).nullish(),
      valueCents: z.number().int().min(0).max(1_000_000_000).optional(),
      assignedUserId: z.string().uuid().nullish(),
      lostReason: z.string().trim().max(500).nullish(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);

    // Load prior state to detect assignment change
    const { data: prior } = await ctx.supabase
      .from("funnel_cards").select("id, company_id, assigned_user_id, value_cents")
      .eq("id", data.id).maybeSingle();
    if (!prior || prior.company_id !== companyId) throw new Error("Card inválido.");

    // If assignee provided, validate the user is member of the company
    if (data.assignedUserId) {
      const { data: prof } = await ctx.supabase
        .from("profiles").select("id, company_id").eq("id", data.assignedUserId).maybeSingle();
      if (!prof || prof.company_id !== companyId) throw new Error("Responsável inválido.");
    }

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.valueCents !== undefined) patch.value_cents = data.valueCents;
    if (data.assignedUserId !== undefined) patch.assigned_user_id = data.assignedUserId;
    if (data.lostReason !== undefined) patch.lost_reason = data.lostReason;

    const { data: updated, error } = await ctx.supabase
      .from("funnel_cards").update(patch)
      .eq("id", data.id).eq("company_id", companyId).select("*").single();
    if (error) throw new Error(error.message);

    if (data.assignedUserId !== undefined && data.assignedUserId !== prior.assigned_user_id) {
      await ctx.supabase.from("funnel_card_events").insert({
        card_id: data.id, company_id: companyId, actor_id: ctx.userId,
        event_type: "assigned",
        meta: { from: prior.assigned_user_id, to: data.assignedUserId ?? null },
      });
    }
    if (data.valueCents !== undefined && data.valueCents !== prior.value_cents) {
      await ctx.supabase.from("funnel_card_events").insert({
        card_id: data.id, company_id: companyId, actor_id: ctx.userId,
        event_type: "value_changed",
        meta: { from: prior.value_cents, to: data.valueCents },
      });
    }
    return updated;
  });

export const archiveCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const { error } = await ctx.supabase
      .from("funnel_cards")
      .update({ archived_at: new Date().toISOString(), status: "archived" })
      .eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await ctx.supabase.from("funnel_card_events").insert({
      card_id: data.id, company_id: companyId, actor_id: ctx.userId,
      event_type: "archived",
    });
    return { ok: true };
  });

export const listCardEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { cardId: string }) => z.object({ cardId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const { data: rows, error } = await ctx.supabase
      .from("funnel_card_events")
      .select("id, event_type, actor_id, from_stage_id, to_stage_id, meta, created_at")
      .eq("card_id", data.cardId).eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============================================================================
// SUPPORT
// ============================================================================

export const listAvailableContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnelId: string; search?: string }) =>
    z.object({
      funnelId: z.string().uuid(),
      search: z.string().trim().max(120).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    // Contacts of the company not already active in this funnel
    const { data: existing } = await ctx.supabase
      .from("funnel_cards").select("contact_id")
      .eq("company_id", companyId).eq("funnel_id", data.funnelId)
      .eq("status", "open").is("archived_at", null);
    const excluded = new Set<string>((existing ?? []).map((r: any) => r.contact_id));

    let q = ctx.supabase
      .from("contacts").select("id, name, phone, email, avatar_url")
      .eq("company_id", companyId).is("deleted_at", null)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (data.search && data.search.length > 0) {
      const term = `%${data.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      q = q.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).filter((r: any) => !excluded.has(r.id));
  });

export const listCompanyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const companyId = await getCompanyId(ctx);
    const { data, error } = await ctx.supabase
      .from("profiles").select("id, full_name, email, avatar_url")
      .eq("company_id", companyId)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
