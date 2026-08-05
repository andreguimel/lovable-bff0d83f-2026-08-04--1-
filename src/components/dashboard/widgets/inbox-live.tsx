import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

import { getUnreadSummary } from "@/lib/analytics.functions";
import { WidgetSkeleton } from "@/components/dashboard/shell/widget-skeleton";
import { WidgetError } from "@/components/dashboard/shell/widget-error";
import { WidgetEmpty } from "@/components/dashboard/shell/widget-empty";
import { useWidgetRealtime } from "@/components/dashboard/hooks/use-widget-realtime";
import { Badge } from "@/components/ui/badge";

export default function InboxLiveWidget() {
  const fetchSummary = useServerFn(getUnreadSummary);
  const q = useQuery({
    queryKey: ["dashboard", "inbox-live"],
    queryFn: () => fetchSummary(),
    staleTime: 15_000,
  });

  useWidgetRealtime({
    channelName: "dashboard-inbox",
    tables: ["conversations", "messages"],
    invalidateKeys: [["dashboard", "inbox-live"]],
  });

  if (q.isPending) return <WidgetSkeleton variant="list" />;
  if (q.error) return <WidgetError message={String(q.error)} onRetry={() => q.refetch()} />;
  const items = q.data?.items ?? [];
  if (!items.length) {
    return (
      <WidgetEmpty
        icon={MessageCircle}
        title="Caixa vazia"
        description="Nenhuma conversa aguardando resposta."
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {items.slice(0, 8).map((c) => (
        <Link
          key={c.kind + c.id}
          to={c.kind === "unread" ? "/inbox/$conversationId" : "/cascades"}
          params={c.kind === "unread" ? { conversationId: c.id } : undefined}
          className="flex items-center gap-3 rounded-xl border border-transparent bg-background/40 px-3 py-2.5 transition hover:border-border hover:bg-accent/50"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-bold text-primary">
            {c.title.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{c.title}</span>
              {c.kind === "cascade" && (
                <Badge variant="outline" className="h-4 text-[9px]">
                  cascata
                </Badge>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">{c.subtitle}</div>
          </div>
          {c.count > 0 && (
            <Badge className="shrink-0 rounded-full bg-primary px-2 text-[10px]">{c.count}</Badge>
          )}
        </Link>
      ))}
    </div>
  );
}

// Suppress unused import warning
void formatDistanceToNow;
void ptBR;
