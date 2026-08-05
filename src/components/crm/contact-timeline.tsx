import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquare,
  Mail,
  Megaphone,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  Bot,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getContactTimeline, type TimelineItem } from "@/lib/timeline.functions";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";

interface Props {
  contactId: string;
}

export function ContactTimeline({ contactId }: Props) {
  const qc = useQueryClient();
  const fn = useServerFn(getContactTimeline);
  const { data, isLoading } = useQuery({
    queryKey: ["contact-timeline", contactId],
    queryFn: () => fn({ data: { contactId } }),
  });

  const [filter, setFilter] = useState<
    "all" | "messages" | "flows" | "transfers" | "cascades" | "emails"
  >("all");

  // Realtime — invalidate on any message/event related to this contact
  useEffect(() => {
    const ch = supabase
      .channel(`contact-timeline-${contactId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_events", filter: `contact_id=eq.${contactId}` },
        () => qc.invalidateQueries({ queryKey: ["contact-timeline", contactId] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => qc.invalidateQueries({ queryKey: ["contact-timeline", contactId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [contactId, qc]);

  const items = data?.items ?? [];
  const filtered = useMemo(() => filterItems(items, filter), [items, filter]);
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Nenhum evento ainda. Toda mensagem, e-mail e cascata aparece aqui.
      </div>
    );
  }


  const filterOpts: Array<{ v: typeof filter; label: string }> = [
    { v: "all", label: "Tudo" },
    { v: "messages", label: "Mensagens" },
    { v: "flows", label: "Fluxos" },
    { v: "transfers", label: "Transferências" },
    { v: "cascades", label: "Cascatas" },
    { v: "emails", label: "E-mails" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 px-1">
        {filterOpts.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
              (filter === f.v
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          Nenhum evento neste filtro.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.label}>
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              <ol className="relative space-y-4 border-l border-border/60 pl-6">
                {g.items.map((it) => (
                  <TimelineRow key={`${it.kind}-${it.id}`} item={it} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function filterItems(items: TimelineItem[], f: string): TimelineItem[] {
  if (f === "all") return items;
  return items.filter((it) => {
    if (f === "messages") return it.kind === "message";
    if (f === "emails")
      return it.kind === "event" && it.event_type === "email_sent";
    if (f === "flows")
      return it.kind === "event" && it.event_type.startsWith("flow_run");
    if (f === "transfers")
      return it.kind === "event" && it.event_type === "conversation_transferred";
    if (f === "cascades") return it.kind === "event" && it.event_type.startsWith("cascade_");
    return true;
  });
}

function groupByDay(items: TimelineItem[]): Array<{ label: string; items: TimelineItem[] }> {
  const groups = new Map<string, TimelineItem[]>();
  const today = new Date();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const todayKey = dayKey(today);
  const yKey = dayKey(y);

  for (const it of items) {
    const d = new Date(it.created_at);
    const k = dayKey(d);
    let label: string;
    if (k === todayKey) label = "Hoje";
    else if (k === yKey) label = "Ontem";
    else
      label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(it);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}


function TimelineRow({ item }: { item: TimelineItem }) {
  const meta = getMeta(item);
  return (
    <li className="relative">
      <span
        className="absolute -left-[33px] top-1 grid h-6 w-6 place-items-center rounded-full border border-border bg-card"
        style={{ color: meta.color }}
      >
        <meta.Icon className="h-3.5 w-3.5" />
      </span>
      <div className="rounded-lg border border-border/60 bg-card/40 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{meta.title}</span>
          {meta.badge && (
            <Badge variant="secondary" className="text-[10px]">
              {meta.badge}
            </Badge>
          )}
          <span className="ml-auto text-muted-foreground">
            <ClientTime iso={item.created_at} />
          </span>
        </div>
        {meta.body && (
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-6">
            {meta.body}
          </p>
        )}
      </div>
    </li>
  );
}

type Meta = {
  Icon: typeof MessageSquare;
  color: string;
  title: string;
  badge?: string;
  body?: string;
};

function getMeta(it: TimelineItem): Meta {
  if (it.kind === "message") {
    const isOut = it.direction === "outbound";
    return {
      Icon: isOut ? ArrowUpRight : ArrowDownLeft,
      color: isOut ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
      title: isOut ? "Mensagem enviada" : "Mensagem recebida",
      badge: it.channel_name ?? undefined,
      body: it.body ?? (it.media_url ? `[${it.type}]` : ""),
    };
  }
  if (it.kind === "broadcast") {
    return {
      Icon: Megaphone,
      color: "hsl(280 70% 55%)",
      title: `Disparo: ${it.broadcast_name}`,
      badge: it.status,
      body: it.personalized_body ?? undefined,
    };
  }
  const p = (typeof it.payload === "object" && it.payload !== null && !Array.isArray(it.payload)
    ? (it.payload as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const label = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));
  switch (it.event_type) {
    case "email_sent":
      return {
        Icon: Mail,
        color: "hsl(200 90% 50%)",
        title: `E-mail enviado`,
        badge: label(p.to),
        body: label(p.subject),
      };
    case "cascade_started":
      return {
        Icon: Zap,
        color: "hsl(45 95% 50%)",
        title: `Cascata iniciada: ${label(p.policy_name)}`,
        badge: `${p.steps ?? "?"} passos`,
      };
    case "cascade_step_sent": {
      const st = label(p.status);
      const okIcon = st === "sent" ? CheckCircle2 : XCircle;
      return {
        Icon: okIcon,
        color: st === "sent" ? "hsl(140 70% 45%)" : "hsl(0 70% 55%)",
        title: `Cascata — passo ${((p.step_index as number) ?? 0) + 1} (${label(p.channel_type)})`,
        badge: st,
        body: p.error ? label(p.error) : undefined,
      };
    }
    case "cascade_completed":
      return { Icon: CheckCircle2, color: "hsl(140 70% 45%)", title: "Cascata concluída" };
    case "cascade_cancelled":
      return { Icon: XCircle, color: "hsl(0 70% 55%)", title: "Cascata cancelada" };
    case "conversation_transferred": {
      const from = label(p.from_channel_name) || "canal anterior";
      const to = label(p.to_channel_name) || "novo canal";
      const flow = p.flow_name ? label(p.flow_name) : null;
      const note = p.note ? label(p.note) : null;
      return {
        Icon: ArrowRightLeft,
        color: "hsl(210 90% 55%)",
        title: `Conversa transferida: ${from} → ${to}`,
        badge: flow ? `fluxo: ${flow}` : undefined,
        body: note ?? undefined,
      };
    }
    case "flow_run_completed":
      return {
        Icon: Bot,
        color: "hsl(160 70% 45%)",
        title: `Fluxo executado: ${label(p.flow_name) || "sem nome"}`,
        badge: `${p.messages_sent ?? 0} mensagem(ns)`,
      };
    default:
      return { Icon: Activity, color: "hsl(var(--muted-foreground))", title: it.event_type };
  }
}
