import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { Json } from "@/integrations/supabase/types";

export type TimelineItem =
  | {
      kind: "message";
      id: string;
      created_at: string;
      direction: "inbound" | "outbound";
      type: string;
      body: string | null;
      media_url: string | null;
      conversation_id: string;
      channel_name: string | null;
    }
  | {
      kind: "event";
      id: string;
      created_at: string;
      event_type: string;
      payload: Json;
      conversation_id: string | null;
    }
  | {
      kind: "broadcast";
      id: string;
      created_at: string;
      broadcast_name: string;
      status: string;
      personalized_body: string | null;
      sent_at: string | null;
    };

export const getContactTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contactId: string; limit?: number }) =>
    z
      .object({
        contactId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ items: TimelineItem[] }> => {
    const limit = data.limit ?? 60;

    // 1) Conversas do contato → mensagens
    const { data: convs } = await context.supabase
      .from("conversations")
      .select("id, channel:channels!channel_id(name)")
      .eq("contact_id", data.contactId);

    const convIds = (convs ?? []).map((c) => c.id);
    const convChannelName = new Map<string, string | null>();
    for (const c of convs ?? []) {
      convChannelName.set(c.id, (c.channel as { name?: string } | null)?.name ?? null);
    }

    let messages: Array<{
      id: string;
      created_at: string;
      direction: "inbound" | "outbound";
      type: string;
      body: string | null;
      media_url: string | null;
      conversation_id: string;
    }> = [];
    if (convIds.length > 0) {
      const { data: msgs, error: mErr } = await context.supabase
        .from("messages")
        .select("id, created_at, direction, type, body, media_url, conversation_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (mErr) throw new Error(mErr.message);
      messages = (msgs ?? []) as typeof messages;
    }

    // 2) Eventos por contato
    const { data: events, error: eErr } = await context.supabase
      .from("channel_events")
      .select("id, created_at, event_type, payload, conversation_id")
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (eErr) throw new Error(eErr.message);

    // 3) Broadcasts em que o contato participou
    const { data: br, error: brErr } = await context.supabase
      .from("broadcast_recipients")
      .select("id, status, sent_at, personalized_body, broadcast:broadcasts(id, name, created_at)")
      .eq("contact_id", data.contactId)
      .order("id", { ascending: false })
      .limit(50);
    if (brErr) throw new Error(brErr.message);

    const items: TimelineItem[] = [];
    for (const m of messages) {
      items.push({
        kind: "message",
        id: m.id,
        created_at: m.created_at,
        direction: m.direction,
        type: m.type,
        body: m.body,
        media_url: m.media_url,
        conversation_id: m.conversation_id,
        channel_name: convChannelName.get(m.conversation_id) ?? null,
      });
    }
    for (const e of events ?? []) {
      items.push({
        kind: "event",
        id: e.id,
        created_at: e.created_at,
        event_type: e.event_type as string,
        payload: (e.payload ?? {}) as Json,
        conversation_id: e.conversation_id as string | null,
      });
    }
    for (const b of br ?? []) {
      const bc = b.broadcast as { id: string; name: string; created_at: string } | null;
      if (!bc) continue;
      items.push({
        kind: "broadcast",
        id: b.id,
        created_at: b.sent_at ?? bc.created_at,
        broadcast_name: bc.name,
        status: b.status,
        personalized_body: b.personalized_body,
        sent_at: b.sent_at,
      });
    }

    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { items: items.slice(0, limit) };
  });
