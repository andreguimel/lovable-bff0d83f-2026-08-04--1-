import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const audienceFilterSchema = z
  .object({
    tagIds: z.array(z.string().uuid()).optional(),
    /** "and" = precisa ter todas as etiquetas; "or" = qualquer uma. */
    tagMode: z.enum(["and", "or"]).optional(),
    hasEmail: z.boolean().optional(),
    lastInteractionDays: z.number().int().min(0).max(3650).optional(),
    /** Filtros da Transmissão (reutilizam colunas já existentes em contacts) */
    nameContains: z.string().trim().max(120).optional(),
    phoneContains: z.string().trim().max(30).optional(),
    areaCode: z.string().trim().max(5).optional(),
    origin: z.string().trim().max(60).optional(),
    ownerId: z.string().uuid().optional(),
    createdFrom: z.string().optional(),
    createdTo: z.string().optional(),
    /** Inclui contatos com automação (fluxo) em execução/pausada. */
    includePausedAutomation: z.boolean().optional(),
  })
  .default({});

export type AudienceFilter = z.infer<typeof audienceFilterSchema>;


async function getCompanyId(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

/**
 * Confirma que o canal existe, é da mesma empresa e não está arquivado.
 * Bloqueia foreign channel attack + envio em canal inativo.
 */
async function assertChannelOwnership(
  supabase: any,
  companyId: string,
  channelId: string,
): Promise<{ id: string; status: string | null; company_id: string }> {
  const { data: ch, error } = await supabase
    .from("channels")
    .select("id, company_id, status, archived_at")
    .eq("id", channelId)
    .maybeSingle();
  if (error || !ch) throw new Error("Canal não encontrado ou sem permissão");
  if (ch.company_id !== companyId) throw new Error("Canal não pertence à sua empresa");
  if (ch.archived_at) throw new Error("Canal arquivado não pode ser usado em campanhas");
  return ch;
}

async function selectAudienceContacts(
  supabase: any,
  companyId: string,
  filter: AudienceFilter,
) {
  let q = supabase
    .from("contacts")
    .select(
      "id, name, phone, phone_canonical, email, origin, owner_id, created_at, last_interaction_at, last_inbound_channel_id",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("merged_into_id", null)
    .not("phone_canonical", "is", null);

  if (filter.hasEmail) q = q.not("email", "is", null);
  if (filter.lastInteractionDays != null) {
    const since = new Date(Date.now() - filter.lastInteractionDays * 86400_000).toISOString();
    q = q.gte("last_interaction_at", since);
  }
  if (filter.nameContains) q = q.ilike("name", `%${filter.nameContains}%`);
  if (filter.phoneContains) {
    const digits = filter.phoneContains.replace(/\D/g, "");
    if (digits) q = q.ilike("phone_canonical", `%${digits}%`);
  }
  if (filter.origin) q = q.eq("origin", filter.origin);
  if (filter.ownerId) q = q.eq("owner_id", filter.ownerId);
  if (filter.createdFrom) q = q.gte("created_at", new Date(filter.createdFrom).toISOString());
  if (filter.createdTo) q = q.lte("created_at", new Date(filter.createdTo).toISOString());

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  let list = (rows ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    phone_canonical: string | null;
    email: string | null;
    origin: string | null;
    owner_id: string | null;
    created_at: string | null;
    last_interaction_at: string | null;
    last_inbound_channel_id: string | null;
  }>;

  if (filter.areaCode) {
    const ddd = filter.areaCode.replace(/\D/g, "");
    if (ddd) {
      list = list.filter((c) => {
        const digits = (c.phone_canonical ?? c.phone ?? "").replace(/\D/g, "");
        // BR: +55 DD 9XXXXXXXX — o DDD são os 2 dígitos após o país
        const local = digits.startsWith("55") ? digits.slice(2) : digits;
        return local.startsWith(ddd);
      });
    }
  }

  if (filter.tagIds?.length) {
    const { data: taggings } = await supabase
      .from("contact_tags")
      .select("contact_id, tag_id")
      .in("tag_id", filter.tagIds);
    const byContact = new Map<string, Set<string>>();
    for (const t of (taggings ?? []) as Array<{ contact_id: string; tag_id: string }>) {
      const set = byContact.get(t.contact_id) ?? new Set<string>();
      set.add(t.tag_id);
      byContact.set(t.contact_id, set);
    }
    const mode = filter.tagMode ?? "or";
    list = list.filter((c) => {
      const set = byContact.get(c.id);
      if (!set) return false;
      return mode === "and" ? filter.tagIds!.every((id) => set.has(id)) : set.size > 0;
    });
  }

  if (filter.includePausedAutomation === false) {
    // Exclui contatos com automação em andamento/aguardando (via conversa do run)
    const { data: activeRuns } = await supabase
      .from("flow_runs")
      .select("conversation_id")
      .eq("company_id", companyId)
      .in("status", ["running", "waiting", "paused"]);
    const convIds = ((activeRuns ?? []) as Array<{ conversation_id: string | null }>)
      .map((r) => r.conversation_id)
      .filter(Boolean) as string[];
    if (convIds.length) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("contact_id")
        .in("id", convIds.slice(0, 1000));
      const busy = new Set(
        ((convs ?? []) as Array<{ contact_id: string | null }>)
          .map((c) => c.contact_id)
          .filter(Boolean) as string[],
      );
      if (busy.size) list = list.filter((c) => !busy.has(c.id));
    }
  }


  // Deduplicate por phone_canonical (Core canônico)
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = c.phone_canonical ?? c.phone;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------- List ----------------
export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("broadcasts")
      .select(
        "id, name, status, channel_id, flow_id, scheduled_at, total_recipients, sent_count, delivered_count, read_count, failed_count, started_at, completed_at, created_at, variables, channel:channels(id, name, color), flow:flows(id, name)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------------- Detail ----------------
export const getBroadcast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: b, error } = await context.supabase
      .from("broadcasts")
      .select("*, channel:channels(id, name, color, status), flow:flows(id, name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!b) throw new Error("Campanha não encontrada");

    const { data: recipients } = await context.supabase
      .from("broadcast_recipients")
      .select("id, status, sent_at, delivered_at, read_at, error, contact:contacts(id, name, phone)")
      .eq("broadcast_id", data.id)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(200);

    return { broadcast: b, recipients: recipients ?? [] };
  });

// ---------------- Preview audience ----------------
export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: AudienceFilter & { sampleSize?: number }) =>
    audienceFilterSchema
      .and(z.object({ sampleSize: z.number().int().min(1).max(100).optional() }).partial())
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const companyId = await getCompanyId(context);
    const contacts = await selectAudienceContacts(context.supabase, companyId, data);
    const sampleSize = (data as { sampleSize?: number }).sampleSize ?? 5;
    const sample = contacts.slice(0, sampleSize);

    if (sampleSize <= 5 || sample.length === 0) {
      return { count: contacts.length, sample };
    }

    // Enriquecimento do preview real (tags + canal + responsável) — só no "Mostrar usuários"
    const ids = sample.map((c) => c.id);
    const [{ data: taggings }, { data: channels }, { data: owners }] = await Promise.all([
      context.supabase
        .from("contact_tags")
        .select("contact_id, tag:tags(id, name, color)")
        .in("contact_id", ids),
      context.supabase.from("channels").select("id, name"),
      context.supabase.from("profiles").select("id, full_name"),
    ]);
    const tagMap = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
    for (const t of (taggings ?? []) as Array<{ contact_id: string; tag: any }>) {
      const arr = tagMap.get(t.contact_id) ?? [];
      if (t.tag) arr.push(t.tag);
      tagMap.set(t.contact_id, arr);
    }
    const chMap = new Map(((channels ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
    const ownerMap = new Map(
      ((owners ?? []) as Array<{ id: string; full_name: string | null }>).map((o) => [o.id, o.full_name]),
    );

    return {
      count: contacts.length,
      sample: sample.map((c) => ({
        ...c,
        tags: tagMap.get(c.id) ?? [],
        channel_name: c.last_inbound_channel_id ? chMap.get(c.last_inbound_channel_id) ?? null : null,
        owner_name: c.owner_id ? ownerMap.get(c.owner_id) ?? null : null,
      })),
    };
  });


// ---------------- Create ----------------
const delaySchema = z.object({
  mode: z.enum(["smart", "manual"]).default("smart"),
  preset: z.enum(["very_short", "short", "medium", "long", "very_long"]).optional(),
  min_seconds: z.number().int().min(1).max(3600).default(1),
  max_seconds: z.number().int().min(1).max(3600).default(5),
});

export type TransmissionDelay = z.infer<typeof delaySchema>;

const createSchemaBase = z.object({
  name: z.string().trim().min(1).max(120),
  channel_id: z.string().uuid(),
  flow_id: z.string().uuid().nullable().optional(),
  message_body: z.string().trim().max(4000).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  media_url: z.string().url().max(500).nullable().optional(),
  media_type: z.string().max(30).nullable().optional(),
  audience_filter: audienceFilterSchema.optional(),
  delay: delaySchema.optional(),
  scheduled_at: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .refine(
      (v) => !v || new Date(v).getTime() > Date.now() - 60_000,
      { message: "Agendamento não pode estar no passado" },
    ),
  rate_per_minute: z.number().int().min(1).max(600).optional(),
});

const createSchema = createSchemaBase.refine(
  (v) => !!v.flow_id || (v.message_body?.trim().length ?? 0) > 0,
  { message: "Informe um fluxo ou uma mensagem", path: ["message_body"] },
);


/** Converte a configuração de atraso no rate_per_minute usado pelo engine existente. */
function delayToRate(delay?: TransmissionDelay | null): number | null {
  if (!delay) return null;
  const avg = Math.max(1, (delay.min_seconds + delay.max_seconds) / 2);
  return Math.min(600, Math.max(1, Math.round(60 / avg)));
}

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof createSchema>) => createSchema.parse(i))
  .handler(async ({ data, context }) => {
    const companyId = await getCompanyId(context);
    await assertChannelOwnership(context.supabase, companyId, data.channel_id);

    if (data.flow_id) {
      const { data: flow } = await context.supabase
        .from("flows")
        .select("id, company_id")
        .eq("id", data.flow_id)
        .maybeSingle();
      if (!flow || flow.company_id !== companyId) throw new Error("Fluxo não encontrado");
    }

    const { data: row, error } = await context.supabase
      .from("broadcasts")
      .insert({
        company_id: companyId,
        name: data.name,
        channel_id: data.channel_id,
        flow_id: data.flow_id ?? null,
        message_body: data.message_body ?? "",
        media_url: data.media_url ?? null,
        media_type: data.media_type ?? null,
        audience_filter: data.audience_filter ?? {},
        variables: {
          ...(data.delay ? { delay: data.delay } : {}),
          ...(data.description ? { description: data.description } : {}),
        },
        scheduled_at: data.scheduled_at ?? null,
        rate_per_minute: data.rate_per_minute ?? delayToRate(data.delay) ?? 30,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

// ---------------- Update ----------------
export const updateBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; patch: z.input<typeof createSchemaBase> }) =>
    z.object({ id: z.string().uuid(), patch: createSchemaBase.partial() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const companyId = await getCompanyId(context);

    // Carrega o broadcast (RLS já bloqueia cross-tenant)
    const { data: existing } = await context.supabase
      .from("broadcasts")
      .select("id, company_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Campanha não encontrada");
    if (["completed", "cancelled"].includes(existing.status)) {
      throw new Error(`Campanha em status ${existing.status} não pode ser editada`);
    }

    if (data.patch.channel_id) {
      await assertChannelOwnership(context.supabase, companyId, data.patch.channel_id);
    }

    const { delay, description, ...columns } = data.patch;
    const patch: Record<string, unknown> = { ...columns };
    if (delay || description !== undefined) {
      const { data: cur } = await context.supabase
        .from("broadcasts")
        .select("variables")
        .eq("id", data.id)
        .maybeSingle();
      patch['variables'] = {
        ...((cur?.variables as Record<string, unknown>) ?? {}),
        ...(delay ? { delay } : {}),
        ...(description !== undefined ? { description } : {}),
      };
      if (delay) patch['rate_per_minute'] = delayToRate(delay as TransmissionDelay) ?? 30;
    }

    const { error } = await context.supabase
      .from("broadcasts")
      .update(patch as never)
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Duplicate ----------------
export const duplicateBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("broadcasts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!b) throw new Error("Campanha não encontrada");
    const { data: row, error } = await context.supabase
      .from("broadcasts")
      .insert({
        company_id: b.company_id,
        name: `${b.name} (cópia)`,
        channel_id: b.channel_id,
        flow_id: b.flow_id,
        message_body: b.message_body,
        media_url: b.media_url,
        media_type: b.media_type,
        audience_filter: b.audience_filter,
        variables: b.variables,
        rate_per_minute: b.rate_per_minute,

        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------------- Delete ----------------
export const deleteBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // Bloqueia delete durante envio ativo
    const { data: existing } = await context.supabase
      .from("broadcasts")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Campanha não encontrada");
    if (existing.status === "sending") {
      throw new Error("Cancele a campanha antes de excluí-la");
    }
    const { error } = await context.supabase.from("broadcasts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Materialize & schedule ----------------
function personalize(
  body: string,
  contact: { name: string | null; phone: string | null; email: string | null },
) {
  const safe = (v: string | null | undefined) => (v && v.trim() ? v : "");
  return body
    .replaceAll("{{nome}}", safe(contact.name))
    .replaceAll("{{name}}", safe(contact.name))
    .replaceAll("{{telefone}}", safe(contact.phone))
    .replaceAll("{{phone}}", safe(contact.phone))
    .replaceAll("{{email}}", safe(contact.email));
}

export const scheduleBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; startNow?: boolean }) =>
    z.object({ id: z.string().uuid(), startNow: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const companyId = await getCompanyId(context);
    const { data: b, error: bErr } = await context.supabase
      .from("broadcasts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (bErr || !b) throw new Error("Campanha não encontrada");
    if (!["draft", "scheduled", "paused"].includes(b.status)) {
      throw new Error(`Campanha já está em status ${b.status}`);
    }
    if (!b.channel_id) throw new Error("Campanha sem canal definido");

    // Revalida canal (mudanças posteriores)
    await assertChannelOwnership(context.supabase, companyId, b.channel_id);

    const filter = audienceFilterSchema.parse(b.audience_filter ?? {});
    const contacts = await selectAudienceContacts(context.supabase, b.company_id, filter);
    if (contacts.length === 0) throw new Error("Nenhum destinatário para essa audiência");

    // Snapshot de recipients — o UNIQUE (broadcast_id, contact_id) protege duplicidade
    const rows = contacts.map((c) => ({
      broadcast_id: b.id,
      company_id: b.company_id,
      contact_id: c.id,
      status: "pending" as const,
      personalized_body: personalize(b.message_body ?? "", c),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await context.supabase
        .from("broadcast_recipients")
        .upsert(chunk, { onConflict: "broadcast_id,contact_id", ignoreDuplicates: true });
    }

    const nextStatus = data.startNow || !b.scheduled_at ? "sending" : "scheduled";
    const patch = {
      status: nextStatus as "sending" | "scheduled",
      started_at: nextStatus === "sending" ? new Date().toISOString() : null,
    };
    const { error } = await context.supabase.from("broadcasts").update(patch).eq("id", b.id);
    if (error) throw new Error(error.message);
    return { ok: true, recipients: contacts.length, status: nextStatus };
  });

export const pauseBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("broadcasts").select("status").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("Campanha não encontrada");
    if (!["sending", "scheduled"].includes(b.status)) {
      throw new Error(`Campanha em status ${b.status} não pode ser pausada`);
    }
    const { error } = await context.supabase
      .from("broadcasts").update({ status: "paused" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resumeBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("broadcasts").select("status").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("Campanha não encontrada");
    if (b.status !== "paused") {
      throw new Error(`Campanha em status ${b.status} não pode ser retomada`);
    }
    const { error } = await context.supabase
      .from("broadcasts").update({ status: "sending" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("broadcasts").select("status").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("Campanha não encontrada");
    if (["completed", "cancelled"].includes(b.status)) {
      return { ok: true }; // idempotente
    }
    const { error } = await context.supabase
      .from("broadcasts")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Send batch (INTERNAL DISPATCH — no external provider) ----------------
/**
 * Processa recipients pendentes de uma campanha em modo INTERNO:
 *   - Claim atômico: UPDATE ... WHERE status='pending' RETURNING id (por-linha, evita
 *     dupla-claim entre workers concorrentes).
 *   - Para cada recipient claimado:
 *       resolve conversa lógica canônica (1 contato = 1 conversa, cross-channel)
 *       cria messages{broadcast_id, channel_id, contact_id, direction='outbound'}
 *       marca recipient como 'sent'
 *   - Rate limit por rate_per_minute do broadcast.
 *
 * Envio externo real (Meta / Cloud API) permanece PENDING FINAL API PHASE.
 */
export const sendBroadcastBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; max?: number }) =>
    z.object({ id: z.string().uuid(), max: z.number().int().min(1).max(200).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("broadcasts")
      .select("id, company_id, channel_id, flow_id, status, rate_per_minute, message_body")
      .eq("id", data.id)
      .maybeSingle();
    if (!b) throw new Error("Campanha não encontrada");
    if (b.status !== "sending") return { ok: true, sent: 0, status: b.status };
    if (!b.channel_id) throw new Error("Campanha sem canal definido");

    // Rate-limit budget: mensagens do broadcast nos últimos 60s
    const perMin = b.rate_per_minute ?? 30;
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount } = await context.supabase
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", b.id)
      .gte("sent_at", windowStart);
    const budget = Math.max(0, perMin - (recentCount ?? 0));
    if (budget === 0) return { ok: true, sent: 0, throttled: true };

    const batchSize = Math.min(data.max ?? 20, budget);

    // Seleciona candidatos pendentes
    const { data: pending } = await context.supabase
      .from("broadcast_recipients")
      .select("id, contact_id, personalized_body")
      .eq("broadcast_id", b.id)
      .eq("status", "pending")
      .limit(batchSize);

    const candidateIds = (pending ?? []).map((r: any) => r.id);
    if (candidateIds.length === 0) {
      await context.supabase
        .from("broadcasts")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", b.id);
      return { ok: true, sent: 0, completed: true };
    }

    // CLAIM ATÔMICO: apenas linhas ainda 'pending' viram 'sending'. Duplo claim → 0 linhas.
    const nowIso = new Date().toISOString();
    const { data: claimed, error: claimErr } = await context.supabase
      .from("broadcast_recipients")
      .update({ status: "sending" })
      .in("id", candidateIds)
      .eq("status", "pending")
      .select("id, contact_id, personalized_body");
    if (claimErr) throw new Error(claimErr.message);
    const claimedRows = (claimed ?? []) as Array<{
      id: string;
      contact_id: string;
      personalized_body: string | null;
    }>;
    if (claimedRows.length === 0) return { ok: true, sent: 0, contended: true };

    // Carrega contatos claimados
    const contactIds = claimedRows.map((r) => r.contact_id);
    const { data: contacts } = await context.supabase
      .from("contacts")
      .select("id, name, phone, email")
      .in("id", contactIds)
      .eq("company_id", b.company_id);
    const contactMap = new Map(
      ((contacts ?? []) as Array<{ id: string; name: string | null; phone: string | null; email: string | null }>).map((c) => [c.id, c]),
    );

    // Dynamic import — .server.ts helpers não podem ser top-level em .functions.ts
    const { findOrCreateLogicalConversation } = await import("@/lib/identity/canonical.server");
    // Transmissão por Fluxo reutiliza o Flow Executor existente (zero engine novo)
    const runFlow = b.flow_id
      ? (await import("@/lib/flow-executor.server")).createAndExecuteRun
      : null;

    let sentCount = 0;
    const okIds: string[] = [];
    const failedIds: Array<{ id: string; error: string }> = [];

    for (const r of claimedRows) {
      const c = contactMap.get(r.contact_id);
      if (!c) {
        failedIds.push({ id: r.id, error: "Contato não encontrado" });
        continue;
      }
      try {
        const conv = await findOrCreateLogicalConversation(context.supabase as never, {
          companyId: b.company_id,
          contactId: c.id,
          originChannelId: b.channel_id,
        });

        if (runFlow && b.flow_id) {
          const res = await runFlow({
            supabase: context.supabase as never,
            companyId: b.company_id,
            flowId: b.flow_id,
            conversationId: conv.conversationId,
            channelId: b.channel_id,
            triggerType: "broadcast",
            triggerPayload: { broadcast_id: b.id, recipient_id: r.id },
            variables: {
              nome: c.name ?? "",
              telefone: c.phone ?? "",
              email: c.email ?? "",
              broadcast_id: b.id,
            },
            // Idempotência por destinatário: reexecução do lote não duplica run
            idempotencyKey: `broadcast:${b.id}:${r.id}`,
          });
          if (res.error && res.state === "FAILED") throw new Error(res.error);
        } else {
          const personalized = r.personalized_body ?? personalize(b.message_body ?? "", c);

          const { error: msgErr } = await context.supabase.from("messages").insert({
            company_id: b.company_id,
            conversation_id: conv.conversationId,
            channel_id: b.channel_id,
            broadcast_id: b.id,
            direction: "outbound",
            type: "text",
            body: personalized,
            status: "sent",
          });
          if (msgErr) throw new Error(msgErr.message);
        }

        okIds.push(r.id);
        sentCount += 1;
      } catch (e) {
        failedIds.push({ id: r.id, error: (e as Error).message.slice(0, 500) });
      }
    }


    if (okIds.length) {
      await context.supabase
        .from("broadcast_recipients")
        .update({ status: "sent", sent_at: nowIso, delivered_at: nowIso, error: null })
        .in("id", okIds);
    }
    for (const f of failedIds) {
      await context.supabase
        .from("broadcast_recipients")
        .update({ status: "failed", error: f.error })
        .eq("id", f.id);
    }

    // Telemetria interna do canal (sem secrets)
    if (b.channel_id && sentCount > 0) {
      await context.supabase.from("channel_events").insert({
        company_id: b.company_id,
        channel_id: b.channel_id,
        event_type: "message_sent",
        payload: { broadcast_id: b.id, count: sentCount },
      });
    }

    return { ok: true, sent: sentCount, failed: failedIds.length };
  });

// ---------------- Channels list (for wizard) ----------------
export const listChannelsForBroadcast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("channels")
      .select("id, name, status, color")
      .is("archived_at", null)
      .order("name");
    return data ?? [];
  });

// ---------------- Tags list (for audience) ----------------
export const listTagsForBroadcast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("tags")
      .select("id, name, color")
      .order("name");
    return data ?? [];
  });
