import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerEnum = z.enum(["whatsapp_cloud", "whatsapp_business", "baileys", "evolution", "stevo"]);
const routingEnum = z.enum(["round_robin", "least_busy", "best_conversion", "manual"]);

// ---- List channels ----
export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { includeArchived?: boolean } | undefined) =>
    z.object({ includeArchived: z.boolean().optional() }).optional().parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("channels")
      .select(
        "id, name, phone_number, status, provider_type, color, avatar_url, paused_at, archived_at, last_connected_at, routing_strategy, daily_message_limit, business_hours, auto_reply_enabled, ai_agent_id, off_hours_message",
      )
      .order("created_at", { ascending: false });
    if (!data?.includeArchived) q = q.is("archived_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) return [];

    // 24h messages per channel via metrics
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: metrics } = await context.supabase
      .from("channel_metrics_daily")
      .select("channel_id, date, messages_sent, messages_received")
      .in("channel_id", ids)
      .gte("date", yest);

    // 7d series
    const start7 = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: series } = await context.supabase
      .from("channel_metrics_daily")
      .select("channel_id, date, messages_sent, messages_received")
      .in("channel_id", ids)
      .gte("date", start7);

    return (rows ?? []).map((r) => {
      const m24 = (metrics ?? []).filter(
        (x) => x.channel_id === r.id && (x.date === today || x.date === yest),
      );
      const sent24 = m24.reduce((s, m) => s + (m.messages_sent ?? 0), 0);
      const recv24 = m24.reduce((s, m) => s + (m.messages_received ?? 0), 0);
      const s7 = (series ?? []).filter((x) => x.channel_id === r.id);
      const spark = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(Date.now() - (6 - i) * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const row = s7.find((x) => x.date === d);
        return {
          date: d,
          total: (row?.messages_sent ?? 0) + (row?.messages_received ?? 0),
        };
      });
      return { ...r, messages_24h: sent24 + recv24, sent_24h: sent24, received_24h: recv24, spark };
    });
  });

// ---- Get single channel + events + series ----
// SECURITY: never return raw credentials / webhook_verify_token to the client.
// Return only boolean presence flags so the UI renders masked placeholders.
export const getChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ch, error } = await context.supabase
      .from("channels")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ch) throw new Error("Canal não encontrado");

    const rawCreds = ((ch as { credentials?: Record<string, unknown> | null }).credentials ?? {}) as Record<string, unknown>;
    const isNonEmpty = (v: unknown) => typeof v === "string" && v.length > 0;
    const credentials_status = {
      has_phone_number_id: isNonEmpty(rawCreds.phone_number_id),
      has_access_token: isNonEmpty(rawCreds.access_token),
      has_app_secret: isNonEmpty(rawCreds.app_secret),
      has_sip_password: isNonEmpty(rawCreds.sip_password),
    };
    const has_webhook_verify_token = isNonEmpty(
      (ch as { webhook_verify_token?: string | null }).webhook_verify_token,
    );

    const safeCreds = {
      instance_id: rawCreds.instance_id ?? null,
      sip_server: rawCreds.sip_server ?? null,
      sip_username: rawCreds.sip_username ?? null,
      sip_password: rawCreds.sip_password ?? null,
      phone_number_id: rawCreds.phone_number_id ?? null,
    };

    // Preserve typing by keeping safe non-secret fields in credentials.
    const safeChannel = { ...(ch as Record<string, unknown>), credentials: safeCreds, webhook_verify_token: null } as unknown as typeof ch;

    const { data: events } = await context.supabase
      .from("channel_events")
      .select("id, event_type, payload, created_at")
      .eq("channel_id", data.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const start30 = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: metrics } = await context.supabase
      .from("channel_metrics_daily")
      .select("date, messages_sent, messages_received")
      .eq("channel_id", data.id)
      .gte("date", start30)
      .order("date", { ascending: true });

    return {
      channel: Object.assign(safeChannel as object, { credentials_status, has_webhook_verify_token }) as typeof ch & {
        credentials_status: typeof credentials_status;
        has_webhook_verify_token: boolean;
      },
      events: events ?? [],
      metrics: metrics ?? [],
    };
  });

// ---- Create ----
export const createChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    name: string;
    phone_number?: string;
    provider_type?: z.infer<typeof providerEnum>;
    color?: string;
    avatar_url?: string;
    credentials?: Record<string, unknown>;
  }) =>
    z
      .object({
        name: z.string().min(1).max(60),
        phone_number: z.string().max(30).optional(),
        provider_type: providerEnum.optional(),
        color: z.string().max(20).optional(),
        avatar_url: z.string().url().max(500).optional(),
        credentials: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    const { assertWithinLimit } = await import("@/lib/limits.server");
    await assertWithinLimit(context.supabase as never, profile.company_id, "channels");

    let credentials = data.credentials ?? {};
    if (data.provider_type === "stevo") {
      const requestedInstanceId =
        typeof credentials.instance_id === "string" ? credentials.instance_id.trim() : "";
      if (!requestedInstanceId || requestedInstanceId === "__create__") {
        const { createStevoInstance } = await import("@/lib/wa-providers/stevo.server");
        const { data: existing } = await context.supabase
          .from("channels")
          .select("credentials")
          .eq("company_id", profile.company_id)
          .eq("provider_type", "stevo");
        const usedIds = (existing ?? [])
          .map((c) => (c.credentials as { instance_id?: string } | null)?.instance_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0);
        const created = await createStevoInstance(data.name, usedIds, profile.company_id);
        if (!created.ok) throw new Error(created.message);
        credentials = { ...credentials, instance_id: created.instance.id };
      }
    }

    const { data: row, error } = await context.supabase
      .from("channels")
      .insert({
        company_id: profile.company_id,
        name: data.name,
        phone_number: data.phone_number ?? null,
        provider_type: data.provider_type ?? "whatsapp_cloud",
        color: data.color ?? "#22c55e",
        avatar_url: data.avatar_url ?? null,
        credentials: credentials as never,
        status: "disconnected",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---- Update ----
export const updateChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; patch: Record<string, unknown> }) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).max(60).optional(),
          phone_number: z.string().max(30).nullable().optional(),
          provider_type: providerEnum.optional(),
          color: z.string().max(20).optional(),
          avatar_url: z.string().url().max(500).nullable().optional(),
          business_hours: z.any().optional(),
          off_hours_message: z.string().max(500).nullable().optional(),
          auto_reply_enabled: z.boolean().optional(),
          ai_agent_id: z.string().uuid().nullable().optional(),
          routing_strategy: routingEnum.optional(),
          daily_message_limit: z.number().int().min(1).max(100000).optional(),
          default_welcome_flow_id: z.string().uuid().nullable().optional(),
          credentials: z.record(z.string(), z.unknown()).optional(),
          webhook_verify_token: z.string().max(200).nullable().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch = { ...data.patch } as Record<string, unknown>;

    // SECURITY: merge credentials with existing DB values so that partial
    // updates (e.g. only phone_number_id) don't wipe stored secrets the UI
    // never received. Empty string on a known field means "clear it".
    if (patch.credentials && typeof patch.credentials === "object") {
      const { data: existing } = await context.supabase
        .from("channels")
        .select("credentials")
        .eq("id", data.id)
        .maybeSingle();
      const prev = ((existing?.credentials as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
      const incoming = patch.credentials as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...prev };
      for (const [k, v] of Object.entries(incoming)) {
        if (v === "" || v === null) delete merged[k];
        else if (typeof v === "string" && v.length > 0) merged[k] = v;
        else if (v !== undefined) merged[k] = v;
      }
      patch.credentials = merged;
    }

    const { error } = await context.supabase
      .from("channels")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (patch.webhook_verify_token && typeof patch.webhook_verify_token === "string") {
      const { data: updatedCh } = await context.supabase
        .from("channels")
        .select("id, company_id, provider_type, credentials, webhook_verify_token")
        .eq("id", data.id)
        .maybeSingle();
      if (updatedCh?.provider_type === "stevo") {
        await ensureStevoWebhook(context.supabase, updatedCh);
      }
    }

    return { ok: true };
  });

// ---- Archive / delete ----
export const archiveChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; archived: boolean }) =>
    z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("channels")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("channels")
      .select("company_id, provider_type, credentials")
      .eq("id", data.id)
      .maybeSingle();
    // Best-effort: desconecta a sessão Stevo antes de excluir o registro
    if (ch?.provider_type === "stevo") {
      const { logoutStevoInstance } = await import("@/lib/wa-providers/stevo.server");
      await logoutStevoInstance({ ...((ch.credentials ?? {}) as Record<string, unknown>), company_id: ch.company_id } as { instance_id?: string; api_key?: string }).catch(() => {});
    }
    const { error } = await context.supabase.from("channels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Session (QR) ----
async function logEvent(
  supabase: ReturnType<typeof requireSupabaseAuth extends never ? never : (() => unknown)> | any,
  companyId: string,
  channelId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  createdAt?: string,
) {
  const row: Record<string, unknown> = {
    company_id: companyId,
    channel_id: channelId,
    event_type: eventType,
    payload,
  };
  if (createdAt) row.created_at = createdAt;
  await supabase.from("channel_events").insert(row);
}

/**
 * Garante que a instância Stevo entrega os eventos inbound neste app.
 * Cria o token do webhook (se ausente) e registra a URL no servidor SM v2.
 */
async function ensureStevoWebhook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,

  ch: { id: string; company_id: string; credentials: unknown; webhook_verify_token?: string | null },
) {
  const configuredBase = (process.env["PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
  const { getRequest } = await import("@tanstack/react-start/server");
  const requestUrl = new URL(getRequest().url);
  // Sempre preferir a URL estável de PRODUÇÃO: o build de preview/dev é
  // recriado a cada edição e pode ficar sem as variáveis de ambiente do
  // Supabase, derrubando o webhook silenciosamente depois de um tempo.
  const hostMatch = requestUrl.hostname.match(
    /^(?:id-preview--|project--)([0-9a-f-]{36})(?:-dev)?\.lovable\.app$/i,
  );
  const requestOrigin = hostMatch?.[1]
    ? `https://project--${hostMatch[1]}-dev.lovable.app`
    : requestUrl.origin;
  const base = configuredBase || requestOrigin;

  let token = ch.webhook_verify_token ?? null;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    await supabase.from("channels").update({ webhook_verify_token: token }).eq("id", ch.id);
  }

  const url = `${base}/api/public/webhooks/stevo/${ch.id}?token=${token}`;
  const { setStevoWebhook } = await import("@/lib/wa-providers/stevo.server");
  const res = await setStevoWebhook({ ...((ch.credentials ?? {}) as Record<string, unknown>), company_id: ch.company_id } as { instance_id?: string }, url);
  await logEvent(supabase, ch.company_id, ch.id, res.ok ? "webhook_received" : "error", {
    via: "stevo_webhook_setup",
    ok: res.ok,
    ...(res.ok ? {} : { code: res.code }),
  });
  return res;
}


export const startChannelSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; force?: boolean }) =>
    z.object({ id: z.string().uuid(), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ch, error: chErr } = await context.supabase
      .from("channels")
      .select("id, company_id, provider_type, credentials, webhook_verify_token")
      .eq("id", data.id)
      .maybeSingle();
    if (chErr || !ch) throw new Error("Canal não encontrado");

    // Stevo: o QR vem do servidor da própria instância (via server_url/token
    // devolvidos pela API de gestão).
    if (ch.provider_type === "stevo") {
      const { getStevoQrCode } = await import("@/lib/wa-providers/stevo.server");
      const creds = (ch.credentials ?? {}) as Record<string, unknown> & { instance_id?: string };
      const res = await getStevoQrCode({ ...creds, company_id: ch.company_id }, data.force);
      if (!res.ok) {
        await logEvent(context.supabase, ch.company_id, ch.id, "qr_failed", { code: res.code });
        throw new Error(res.message);
      }
      // A Stevo pode provisionar um novo slot (instance_id muda) ao ativar o servidor.
      if (res.instanceId && res.instanceId !== creds.instance_id) {
        const nextCreds = { ...creds, instance_id: res.instanceId };
        await context.supabase.from("channels").update({ credentials: nextCreds }).eq("id", ch.id);
        ch.credentials = nextCreds;
      }
      // Registra o webhook na instância efetivamente ativa.
      await ensureStevoWebhook(context.supabase, ch);

      if (res.connected) {
        await context.supabase
          .from("channels")
          .update({
            status: "connected",
            qr_code: null,
            qr_expires_at: null,
            last_connected_at: new Date().toISOString(),
          })
          .eq("id", data.id);
        await logEvent(context.supabase, ch.company_id, ch.id, "connected", { via: "stevo_qr" });
        return { qr: null, qr_image: null, pairing_code: null, expires_at: null, connected: true };
      }

      const expiresStevo = new Date(Date.now() + 120_000).toISOString();
      const { error: qrErr } = await context.supabase
        .from("channels")
        .update({
          status: "connecting",
          qr_code: res.qr,
          qr_expires_at: expiresStevo,
        })
        .eq("id", data.id);
      if (qrErr) throw new Error(qrErr.message);
      await logEvent(context.supabase, ch.company_id, ch.id, "qr_generated", { via: "stevo" });
      return {
        qr: res.qr,
        qr_image: res.qrImage,
        pairing_code: res.pairingCode,
        expires_at: expiresStevo,
        connected: false,
      };
    }


    const nonce = crypto.randomUUID();
    const qr = `wa-connect://${data.id}:${nonce}`;
    const expires = new Date(Date.now() + 90_000).toISOString();
    const { error } = await context.supabase
      .from("channels")
      .update({
        status: "connecting",
        qr_code: qr,
        qr_expires_at: expires,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logEvent(context.supabase, ch.company_id, ch.id, "qr_generated", { nonce });
    return { qr, qr_image: null, pairing_code: null, expires_at: expires, connected: false };
  });

// ---- Stevo: sincroniza o estado real da instância com o canal ----
export const syncStevoChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ch, error: chErr } = await context.supabase
      .from("channels")
      .select("id, company_id, provider_type, credentials, phone_number, webhook_verify_token, status")
      .eq("id", data.id)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!ch) throw new Error("Canal não encontrado");
    if (ch.provider_type !== "stevo") throw new Error("Canal não é do provedor Stevo");

    const { testStevoInstance } = await import("@/lib/wa-providers/stevo.server");
    const res = await testStevoInstance({ ...((ch.credentials ?? {}) as Record<string, unknown>), company_id: ch.company_id } as { instance_id?: string });

    if (!res.ok) {
      // Erro de rede transitório não deve derrubar um canal já conectado.
      if (res.code === "NETWORK_ERROR" && ch.status === "connected") {
        await logEvent(context.supabase, ch.company_id, ch.id, "sync_failed", {
          code: res.code,
          kept_status: true,
        });
        return { ok: false as const, connected: true, code: res.code, message: res.message };
      }
      await context.supabase
        .from("channels")
        .update({ status: "disconnected", qr_code: null, qr_expires_at: null })
        .eq("id", data.id);
      await logEvent(context.supabase, ch.company_id, ch.id, "sync_failed", { code: res.code });
      return { ok: false as const, connected: false, code: res.code, message: res.message };
    }

    const connected = res.instance.connected === true;

    // Sem confirmação de `LoggedIn`: só mantemos o status atual quando o
    // servidor da instância existe e está de pé (falha de rede pontual).
    // Instância parada/sem sessão significa desconexão real na Stevo.
    if (!connected && !res.verified && res.serverConnected && !res.noSession) {
      await logEvent(context.supabase, ch.company_id, ch.id, "sync_not_connected", {
        via: "stevo_sync",
        unverified: true,
        instance_id: res.instance.id,
      });
      return {
        ok: true as const,
        connected: ch.status === "connected",
        code: "NOT_VERIFIED",
        message:
          "Não foi possível confirmar o pareamento no servidor da instância. Aguardando a leitura do QR Code.",
        instance: {
          id: res.instance.id,
          name: res.instance.name ?? null,
          phone: res.instance.phone ?? null,
          status: res.instance.status ?? null,
        },
      };
    }



    const update: {
      status: "connected" | "disconnected";
      qr_code: null;
      qr_expires_at: null;
      last_connected_at?: string;
      phone_number?: string;
    } = {
      status: connected ? "connected" : "disconnected",
      qr_code: null,
      qr_expires_at: null,
    };
    if (connected) {
      update.last_connected_at = new Date().toISOString();
      if (res.instance.phone) update.phone_number = res.instance.phone;
      // Reafirma o webhook a cada sync bem-sucedido (idempotente).
      await ensureStevoWebhook(context.supabase, ch);
    }
    const { error } = await context.supabase.from("channels").update(update).eq("id", data.id);


    if (error) throw new Error(error.message);

    await logEvent(
      context.supabase,
      ch.company_id,
      ch.id,
      connected ? "connected" : "sync_not_connected",
      { via: "stevo_sync", instance_id: res.instance.id },
    );

    return {
      ok: true as const,
      connected,
      code: connected ? "OK" : "NOT_CONNECTED",
      message: connected
        ? `Instância conectada${res.instance.phone ? ` (${res.instance.phone})` : ""}.`
        : "A instância ainda não está pareada. Leia o QR Code para concluir a conexão.",

      instance: {
        id: res.instance.id,
        name: res.instance.name ?? null,
        phone: res.instance.phone ?? null,
        status: res.instance.status ?? null,
      },
    };
  });

// ---- Stevo: reconcilia o status de TODOS os canais Stevo da empresa ----
// Usado pela tela de Canais em polling, para que o status exibido reflita
// o estado real da instância na Stevo (ex.: desconexão feita lá fora).
export const refreshStevoChannelStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("channels")
      .select("id, company_id, credentials, status")
      .eq("provider_type", "stevo")
      .is("archived_at", null);
    if (!rows?.length) return { checked: 0, changed: 0 };

    const { testStevoInstance } = await import("@/lib/wa-providers/stevo.server");
    let changed = 0;
    for (const ch of rows) {
      const res = await testStevoInstance({ ...((ch.credentials ?? {}) as Record<string, unknown>), company_id: ch.company_id } as { instance_id?: string });
      let next: "connected" | "disconnected" | null = null;
      if (!res.ok) {
        next = res.code === "NETWORK_ERROR" ? null : "disconnected";
      } else if (res.instance.connected) {
        next = "connected";
      } else if (res.verified || res.noSession || !res.serverConnected) {
        next = "disconnected";
      }
      if (!next || next === ch.status) continue;
      await context.supabase
        .from("channels")
        .update(
          next === "connected"
            ? { status: next, qr_code: null, qr_expires_at: null, last_connected_at: new Date().toISOString() }
            : { status: next, qr_code: null, qr_expires_at: null },
        )
        .eq("id", ch.id);
      await logEvent(
        context.supabase,
        ch.company_id,
        ch.id,
        next === "connected" ? "connected" : "disconnected",
        { via: "stevo_auto_sync" },
      );
      changed++;
    }
    return { checked: rows.length, changed };
  });




// Client-driven finalize (called by QR dialog after simulated pairing delay).
// Reliable because it runs in a normal request, unlike a fire-and-forget setTimeout on a worker.
export const finalizeChannelSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("channels")
      .select("id, company_id, status, qr_code")
      .eq("id", data.id)
      .maybeSingle();
    if (!ch) throw new Error("Canal não encontrado");
    if (ch.status === "connected") return { ok: true, already: true };
    if (!ch.qr_code) throw new Error("Nenhuma sessão em andamento");
    const { error } = await context.supabase
      .from("channels")
      .update({
        status: "connected",
        qr_code: null,
        qr_expires_at: null,
        last_connected_at: new Date().toISOString(),
        session_data: { paired_at: new Date().toISOString() },
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(context.supabase, ch.company_id, ch.id, "connected", { via: "qr" });
    return { ok: true };
  });

export const disconnectChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("channels")
      .select("company_id, provider_type, credentials")
      .eq("id", data.id)
      .maybeSingle();
    if (!ch) throw new Error("Canal não encontrado");
    if (ch.provider_type === "stevo") {
      const { logoutStevoInstance } = await import("@/lib/wa-providers/stevo.server");
      await logoutStevoInstance({ ...((ch.credentials ?? {}) as Record<string, unknown>), company_id: ch.company_id } as { instance_id?: string; api_key?: string }).catch(() => {});
    }
    const { error } = await context.supabase
      .from("channels")
      .update({ status: "disconnected", qr_code: null, session_data: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(context.supabase, ch.company_id, data.id, "disconnected", { manual: true });
    return { ok: true };
  });

export const setChannelPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; paused: boolean }) =>
    z.object({ id: z.string().uuid(), paused: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("channels")
      .select("company_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!ch) throw new Error("Canal não encontrado");
    const { error } = await context.supabase
      .from("channels")
      .update({ paused_at: data.paused ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(context.supabase, ch.company_id, data.id, data.paused ? "paused" : "resumed");
    return { ok: true };
  });

// ---- Send test message ----
export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; phone: string; body: string }) =>
    z
      .object({
        id: z.string().uuid(),
        phone: z.string().min(6).max(30),
        body: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("channels")
      .select("id, company_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!ch) throw new Error("Canal não encontrado");
    if (ch.status !== "connected") throw new Error("Canal precisa estar conectado");

    await logEvent(context.supabase, ch.company_id, ch.id, "test_sent", {
      phone: data.phone,
      body: data.body,
    });
    return { ok: true };
  });

// ---- List AI agents (for select) ----
export const listAiAgentsForChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_agents")
      .select("id, name")
      .order("name", { ascending: true });
    return data ?? [];
  });

// ---- List flows for select (channel welcome flow) ----
export const listFlowsForChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("flows")
      .select("id, name, status")
      .order("name", { ascending: true });
    return data ?? [];
  });

// ============================================================
// CHANNEL-ROUTING-01 · Setores + Membros responsáveis
// ============================================================

async function getUserCompanyId(sb: any, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

async function ensureChannelInCompany(sb: any, channelId: string, companyId: string) {
  const { data } = await sb
    .from("channels")
    .select("id, company_id, department_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!data || data.company_id !== companyId) throw new Error("Canal não encontrado");
  return data as { id: string; company_id: string; department_id: string | null };
}

// GET roteamento do canal: setor atual + membros vinculados + listas para seleção
export const getChannelRouting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channelId: string }) =>
    z.object({ channelId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const channel = await ensureChannelInCompany(context.supabase, data.channelId, companyId);

    const [deptsRes, membersRes, profilesRes, assignedRes] = await Promise.all([
      context.supabase
        .from("departments")
        .select("id, name, description, color")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("name", { ascending: true }),
      context.supabase
        .from("team_member_profiles")
        .select("user_id, department_id, status, job_title")
        .eq("company_id", companyId),
      context.supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("company_id", companyId),
      context.supabase
        .from("member_channels")
        .select("user_id")
        .eq("channel_id", data.channelId)
        .eq("company_id", companyId),
    ]);

    const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const extById = new Map((membersRes.data ?? []).map((m: any) => [m.user_id, m]));

    const members = (profilesRes.data ?? []).map((p: any) => {
      const ext = extById.get(p.id) as any;
      return {
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        avatar_url: p.avatar_url,
        department_id: ext?.department_id ?? null,
        job_title: ext?.job_title ?? null,
        status: ext?.status ?? "active",
      };
    });

    const assignedIds = new Set((assignedRes.data ?? []).map((r: any) => r.user_id));

    return {
      channel: {
        id: channel.id,
        department_id: channel.department_id,
      },
      departments: deptsRes.data ?? [],
      members,
      assignedMemberIds: Array.from(assignedIds),
    };
  });

// Criar setor inline
export const createDepartmentInline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; description?: string | null }) =>
    z
      .object({
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);

    // Check duplicate (case-insensitive) among non-archived departments
    const { data: existing } = await context.supabase
      .from("departments")
      .select("id, name")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .ilike("name", data.name.trim());
    if ((existing ?? []).length > 0) {
      throw new Error(`Já existe um setor "${(existing as any)[0].name}" nesta empresa.`);
    }

    const { data: row, error } = await context.supabase
      .from("departments")
      .insert({
        company_id: companyId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
      })
      .select("id, name, description, color")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// Salvar roteamento (setor + membros) de um canal, com validação multi-tenant
export const saveChannelRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channelId: string; departmentId: string | null; memberIds: string[] }) =>
    z
      .object({
        channelId: z.string().uuid(),
        departmentId: z.string().uuid().nullable(),
        memberIds: z.array(z.string().uuid()).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    await ensureChannelInCompany(context.supabase, data.channelId, companyId);

    // Validate department belongs to same company (if provided)
    if (data.departmentId) {
      const { data: dept } = await context.supabase
        .from("departments")
        .select("id, company_id, archived_at")
        .eq("id", data.departmentId)
        .maybeSingle();
      if (!dept || dept.company_id !== companyId) throw new Error("Setor inválido para esta empresa.");
      if (dept.archived_at) throw new Error("O setor selecionado está arquivado.");
    }

    // Validate members belong to same company (via profiles)
    const uniqueMemberIds = Array.from(new Set(data.memberIds));
    if (uniqueMemberIds.length > 0) {
      const { data: validMembers } = await context.supabase
        .from("profiles")
        .select("id")
        .eq("company_id", companyId)
        .in("id", uniqueMemberIds);
      const validIds = new Set((validMembers ?? []).map((m: any) => m.id));
      const invalid = uniqueMemberIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) throw new Error("Um ou mais membros não pertencem a esta empresa.");
    }

    // Update channel.department_id
    const { error: chErr } = await context.supabase
      .from("channels")
      .update({ department_id: data.departmentId })
      .eq("id", data.channelId)
      .eq("company_id", companyId);
    if (chErr) throw new Error(chErr.message);

    // Diff member_channels
    const { data: currentAssoc } = await context.supabase
      .from("member_channels")
      .select("user_id")
      .eq("channel_id", data.channelId)
      .eq("company_id", companyId);
    const currentIds = new Set((currentAssoc ?? []).map((r: any) => r.user_id));
    const targetIds = new Set(uniqueMemberIds);

    const toAdd = uniqueMemberIds.filter((id) => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter((id) => !targetIds.has(id));

    if (toRemove.length > 0) {
      const { error } = await context.supabase
        .from("member_channels")
        .delete()
        .eq("channel_id", data.channelId)
        .eq("company_id", companyId)
        .in("user_id", toRemove);
      if (error) throw new Error(error.message);
    }
    if (toAdd.length > 0) {
      const rows = toAdd.map((uid) => ({
        company_id: companyId,
        channel_id: data.channelId,
        user_id: uid,
      }));
      const { error } = await context.supabase.from("member_channels").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { ok: true, added: toAdd.length, removed: toRemove.length };
  });

// ---- Test connection (WhatsApp Cloud only) ----
// Uses stored credentials to call Meta Graph API v20 and confirm the phone
// number is reachable with the configured token. Never returns secrets to
// the client. RLS + supabase context enforce multi-tenant isolation: only
// channels visible to the caller's company can be tested.
export const testChannelConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ch, error: chErr } = await context.supabase
      .from("channels")
      .select("id, company_id, provider_type, credentials")
      .eq("id", data.id)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!ch) throw new Error("Canal não encontrado");
    if (ch.provider_type === "stevo") {
      const { testStevoInstance } = await import("@/lib/wa-providers/stevo.server");
      const res = await testStevoInstance((ch.credentials ?? {}) as { instance_id?: string });
      if (!res.ok) {
        await logEvent(context.supabase, ch.company_id, ch.id, "test_connection_failed", {
          code: res.code,
        });
        return { ok: false as const, code: res.code, message: res.message };
      }
      if (!res.instance.connected) {
        await logEvent(context.supabase, ch.company_id, ch.id, "test_connection_failed", {
          code: "NOT_CONNECTED",
        });
        return {
          ok: false as const,
          code: "NOT_CONNECTED",
          message:
            "A instância existe na Stevo, mas o WhatsApp ainda não está pareado. Faça a leitura do QR code no painel da Stevo e sincronize aqui.",
        };
      }
      await logEvent(context.supabase, ch.company_id, ch.id, "test_connection_ok", {
        instance_id: res.instance.id,
        status: res.instance.status,
      });
      return {
        ok: true as const,
        code: "OK",
        message: `Instância Stevo conectada: ${res.instance.name ?? res.instance.id}`,
        display_phone_number: res.instance.phone ?? null,
        verified_name: res.instance.name ?? null,
      };
    }


    if (ch.provider_type !== "whatsapp_cloud") {
      return {
        ok: false as const,
        code: "PROVIDER_UNSUPPORTED",
        message: "Teste disponível apenas para WhatsApp Cloud API e Stevo.",
      };
    }

    const creds = (ch.credentials ?? {}) as Record<string, unknown>;
    const phoneId = typeof creds.phone_number_id === "string" ? creds.phone_number_id : "";
    const token = typeof creds.access_token === "string" ? creds.access_token : "";
    if (!phoneId || !token) {
      return {
        ok: false as const,
        code: "MISSING_CREDENTIALS",
        message: "Configure Phone Number ID e Access Token antes de testar.",
      };
    }

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name,id`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      return {
        ok: false as const,
        code: "NETWORK_ERROR",
        message: "Falha de rede ao contatar a Meta. Tente novamente.",
      };
    }

    if (!resp.ok) {
      let metaCode: number | undefined;
      let metaType: string | undefined;
      try {
        const j = (await resp.json()) as { error?: { code?: number; type?: string } };
        metaCode = j.error?.code;
        metaType = j.error?.type;
      } catch {
        /* ignore parse errors */
      }

      let code = "META_ERROR";
      let message = "A Meta rejeitou a requisição. Verifique as credenciais.";
      if (resp.status === 401 || metaCode === 190 || metaType === "OAuthException") {
        code = "TOKEN_INVALID";
        message = "Access Token inválido, expirado ou não autorizado.";
      } else if (resp.status === 404 || metaCode === 100) {
        code = "PHONE_ID_INVALID";
        message = "Phone Number ID inválido ou inacessível com este token.";
      } else if (resp.status === 403 || metaCode === 200 || metaCode === 10) {
        code = "PERMISSION_DENIED";
        message = "Permissão insuficiente. Confira as permissões do token na Meta.";
      }
      await logEvent(context.supabase, ch.company_id, ch.id, "test_connection_failed", {
        status: resp.status,
        code,
      });
      return { ok: false as const, code, message };
    }

    let body: { display_phone_number?: string; verified_name?: string; id?: string } = {};
    try {
      body = (await resp.json()) as typeof body;
    } catch {
      return {
        ok: false as const,
        code: "META_ERROR",
        message: "Resposta inesperada da Meta.",
      };
    }

    const now = new Date().toISOString();
    await context.supabase
      .from("channels")
      .update({ status: "connected", last_connected_at: now })
      .eq("id", data.id);

    await logEvent(context.supabase, ch.company_id, ch.id, "test_connection_ok", {
      display_phone_number: body.display_phone_number ?? null,
      verified_name: body.verified_name ?? null,
    });

    return {
      ok: true as const,
      display_phone_number: body.display_phone_number ?? null,
      verified_name: body.verified_name ?? null,
      tested_at: now,
    };
  });




// ---- Stevo: listar instâncias da conta do workspace ----
export const listStevoInstancesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado");

    const { listStevoInstances } = await import("@/lib/wa-providers/stevo.server");
    const res = await listStevoInstances({ company_id: profile.company_id });
    if (!res.ok) return { ok: false as const, code: res.code, message: res.message, instances: [] };
    return { ok: true as const, code: "OK", message: "", instances: res.instances };
  });
