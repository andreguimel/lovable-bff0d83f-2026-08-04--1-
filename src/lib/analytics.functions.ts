import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeSchema = z
  .object({ days: z.number().int().min(1).max(365).optional() })
  .optional();

export type DashboardKpis = {
  conversationsOpen: number;
  conversationsResolved: number;
  messagesIn: number;
  messagesOut: number;
  contactsNew: number;
  cascadesRunning: number;
  readRate: number | null;
  volumeSeries: Array<{ date: string; inbound: number; outbound: number }>;
  channelBreakdown: Array<{ channel: string; sent: number; received: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  topAgents: Array<{ name: string; resolved: number }>;
};

function startOfDayISO(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString();
}

export const getDashboardKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => rangeSchema.parse(input))
  .handler(async ({ data, context }): Promise<DashboardKpis> => {
    const days = data?.days ?? 30;
    const since = startOfDayISO(days);

    const [convsRes, msgsRes, contactsRes, cascadesRes, channelsRes, metricsRes] =
      await Promise.all([
        context.supabase
          .from("conversations")
          .select("id, status, created_at")
          .gte("created_at", since),
        context.supabase
          .from("messages")
          .select("id, direction, status, created_at, conversation_id")
          .gte("created_at", since),
        context.supabase.from("contacts").select("id, created_at").gte("created_at", since),
        context.supabase.from("cascade_runs").select("id, status").eq("status", "running"),
        context.supabase.from("channels").select("id, name"),
        context.supabase
          .from("channel_metrics_daily")
          .select("channel_id, date, messages_sent, messages_received")
          .gte("date", since.slice(0, 10)),
      ]);

    const convs = (convsRes.data ?? []) as Array<{ id: string; status: string; created_at: string }>;
    const msgs = (msgsRes.data ?? []) as Array<{
      id: string;
      direction: "inbound" | "outbound";
      status: string | null;
      created_at: string;
      conversation_id: string;
    }>;
    const contacts = contactsRes.data ?? [];
    const cascades = cascadesRes.data ?? [];
    const channels = (channelsRes.data ?? []) as Array<{ id: string; name: string }>;
    const metrics = (metricsRes.data ?? []) as Array<{
      channel_id: string;
      date: string;
      messages_sent: number | null;
      messages_received: number | null;
    }>;

    const conversationsOpen = convs.filter((c) => c.status === "open" || c.status === "pending").length;
    const conversationsResolved = convs.filter((c) => c.status === "resolved").length;

    const messagesIn = msgs.filter((m) => m.direction === "inbound").length;
    const messagesOut = msgs.filter((m) => m.direction === "outbound").length;

    const contactsNew = contacts.length;
    const cascadesRunning = cascades.length;

    // read rate on outbound (status = 'read')
    const outbound = msgs.filter((m) => m.direction === "outbound");
    const readOutbound = outbound.filter((m) => m.status === "read").length;
    const readRate = outbound.length ? readOutbound / outbound.length : null;

    // volume series
    const seriesMap = new Map<string, { inbound: number; outbound: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      const k = d.toISOString().slice(0, 10);
      seriesMap.set(k, { inbound: 0, outbound: 0 });
    }
    for (const m of msgs) {
      const k = m.created_at.slice(0, 10);
      const cur = seriesMap.get(k);
      if (!cur) continue;
      if (m.direction === "inbound") cur.inbound += 1;
      else cur.outbound += 1;
    }
    const volumeSeries = Array.from(seriesMap.entries()).map(([date, v]) => ({
      date,
      inbound: v.inbound,
      outbound: v.outbound,
    }));

    // channel breakdown
    const channelNameById = new Map(channels.map((c) => [c.id, c.name]));
    const chAgg = new Map<string, { sent: number; received: number }>();
    for (const r of metrics) {
      const cur = chAgg.get(r.channel_id) ?? { sent: 0, received: 0 };
      cur.sent += r.messages_sent ?? 0;
      cur.received += r.messages_received ?? 0;
      chAgg.set(r.channel_id, cur);
    }
    const channelBreakdown = Array.from(chAgg.entries())
      .map(([id, v]) => ({ channel: channelNameById.get(id) ?? "—", sent: v.sent, received: v.received }))
      .sort((a, b) => b.sent + b.received - (a.sent + a.received))
      .slice(0, 8);

    // status breakdown (all conversations)
    const { data: allConvs } = await context.supabase.from("conversations").select("status");
    const statusMap = new Map<string, number>();
    for (const c of (allConvs ?? []) as Array<{ status: string }>) {
      statusMap.set(c.status, (statusMap.get(c.status) ?? 0) + 1);
    }
    const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    // top agents by resolved
    const { data: resolvedConvs } = await context.supabase
      .from("conversations")
      .select("assigned_user_id")
      .eq("status", "resolved")
      .gte("created_at", since);
    const agentCounts = new Map<string, number>();
    for (const c of (resolvedConvs ?? []) as Array<{ assigned_user_id: string | null }>) {
      if (!c.assigned_user_id) continue;
      agentCounts.set(c.assigned_user_id, (agentCounts.get(c.assigned_user_id) ?? 0) + 1);
    }
    let topAgents: Array<{ name: string; resolved: number }> = [];
    if (agentCounts.size > 0) {
      const ids = Array.from(agentCounts.keys());
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const nameById = new Map(
        ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => [
          p.id,
          p.full_name ?? p.email ?? "Agente",
        ]),
      );
      topAgents = Array.from(agentCounts.entries())
        .map(([id, resolved]) => ({ name: nameById.get(id) ?? "Agente", resolved }))
        .sort((a, b) => b.resolved - a.resolved)
        .slice(0, 5);
    }

    return {
      conversationsOpen,
      conversationsResolved,
      messagesIn,
      messagesOut,
      contactsNew,
      cascadesRunning,
      readRate,
      volumeSeries,
      channelBreakdown,
      statusBreakdown,
      topAgents,
    };
  });

export const getUnreadSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [unreadRes, exhaustedRes] = await Promise.all([
      context.supabase
        .from("conversations")
        .select("id, unread_count, last_message_preview, contact:contacts(name)")
        .gt("unread_count", 0)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false })
        .limit(10),
      context.supabase
        .from("cascade_runs")
        .select("id, status, completed_at, policy:cascade_policies(name)")
        .eq("status", "exhausted")
        .gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("completed_at", { ascending: false })
        .limit(10),
    ]);
    const unread = (unreadRes.data ?? []) as Array<{
      id: string;
      unread_count: number | null;
      last_message_preview: string | null;
      contact: { name?: string } | null;
    }>;
    const exhausted = (exhaustedRes.data ?? []) as Array<{
      id: string;
      status: string;
      completed_at: string | null;
      policy: { name?: string } | null;
    }>;
    return {
      unreadCount: unread.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
      exhaustedCount: exhausted.length,
      items: [
        ...unread.map((c) => ({
          kind: "unread" as const,
          id: c.id,
          title: c.contact?.name ?? "Contato",
          subtitle: c.last_message_preview ?? "Nova mensagem",
          count: c.unread_count ?? 0,
        })),
        ...exhausted.map((r) => ({
          kind: "cascade" as const,
          id: r.id,
          title: "Cascata esgotada",
          subtitle: r.policy?.name ?? "Política",
          count: 0,
        })),
      ],
    };
  });
