import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeRealtime } from "@/lib/realtime/registry";
import { WidgetSkeleton } from "@/components/dashboard/shell/widget-skeleton";
import { WidgetEmpty } from "@/components/dashboard/shell/widget-empty";
import { Activity, Bot, MessageCircle, ShieldAlert, Workflow, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Event = {
  id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown> | null;
};

const ICON_MAP: Record<string, typeof Activity> = {
  Conversation: MessageCircle,
  Flow: Workflow,
  Agent: Bot,
  Guardian: ShieldAlert,
  Cascade: Zap,
};

function pickIcon(event_type: string) {
  for (const key of Object.keys(ICON_MAP)) {
    if (event_type.includes(key)) return ICON_MAP[key];
  }
  return Activity;
}

export default function ActivityTimelineWidget() {
  const [items, setItems] = useState<Event[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("domain_events")
        .select("id, event_type, occurred_at, payload")
        .order("occurred_at", { ascending: false })
        .limit(20);
      if (alive) setItems((data ?? []) as unknown as Event[]);
    })();

    const unsub = subscribeRealtime("dashboard-activity", {
      table: "domain_events",
      event: "INSERT",
      onEvent: (payload) => {
        const row = (payload as { new: Event }).new;
        setItems((prev) => (prev ? [row, ...prev].slice(0, 20) : [row]));
      },
    });

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  if (items === null) return <WidgetSkeleton variant="timeline" />;
  if (!items.length) {
    return (
      <WidgetEmpty
        icon={Activity}
        title="Nenhuma atividade ainda"
        description="Assim que fluxos, IA ou conversas se movimentarem, você verá aqui em tempo real."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((e) => {
        const Icon = pickIcon(e.event_type);
        return (
          <li key={e.id} className="flex gap-3">
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{humanize(e.event_type)}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true, locale: ptBR })}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function humanize(t: string): string {
  return t
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}
