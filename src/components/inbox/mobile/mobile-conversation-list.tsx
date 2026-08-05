import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, CheckCheck, Filter, Loader2, Inbox as InboxIcon, Star, Search, User } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { listConversations } from "@/lib/inbox.functions";
import { useRealtimeConversations } from "@/hooks/use-realtime-messages";
import { ConversationActions, ConversationMenuButton } from "@/components/inbox/conversation-actions";
import { InboxTabs, type InboxTab } from "@/components/inbox/inbox-tabs";

const statusFilters: Array<{ label: string; value: "all" | "open" | "pending" | "resolved" }> = [
  { label: "Todas", value: "all" },
  { label: "Abertas", value: "open" },
  { label: "Pendentes", value: "pending" },
  { label: "Resolvidas", value: "resolved" },
];

const scopeFilters: Array<{ label: string; value: "all" | "mine" | "unassigned" }> = [
  { label: "Todos", value: "all" },
  { label: "Minhas", value: "mine" },
  { label: "Sem responsável", value: "unassigned" },
];

/**
 * Mobile-native conversation list — full-width, WhatsApp-like cards.
 * Reuses `listConversations` server fn and realtime hook to preserve logic.
 */
export function MobileConversationList() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "resolved">("all");
  const [scope, setScope] = useState<"all" | "mine" | "unassigned">("all");
  const [tab, setTab] = useState<InboxTab>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const list = useServerFn(listConversations);

  useRealtimeConversations();

  const { data: allConversations = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["conversations", filter, scope, q],
    queryFn: () => list({ data: { status: filter, search: q, scope } }),
  });

  const totalUnread = useMemo(
    () => allConversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0),
    [allConversations],
  );

  const conversations = useMemo(() => {
    let rows = allConversations;
    if (tab === "unread") rows = rows.filter((c) => (c.unread_count ?? 0) > 0);
    if (tab === "starred") rows = rows.filter((c) => Boolean(c.pinned));
    if (tab === "groups") {
      rows = rows.filter((c) => {
        const contact = c.contact as { name?: string; phone?: string } | null;
        return contact?.phone?.includes("g.us") || contact?.name?.toLowerCase().includes("grupo");
      });
    } else if (tab === "all") {
      rows = rows.filter((c) => {
        const contact = c.contact as { name?: string; phone?: string } | null;
        return !contact?.phone?.includes("g.us") && !contact?.name?.toLowerCase().includes("grupo");
      });
    }
    if (tab !== "recent") return rows;
    const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);
    return [...rows].sort((a, b) => time(b.last_message_at) - time(a.last_message_at));
  }, [allConversations, tab]);


  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      {/* Search + filter */}
      <div className="shrink-0 border-b border-border/50 bg-background/90 px-3 pb-2 pt-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-11 rounded-xl border-border/60 bg-muted/40 pl-9 text-[15px] shadow-none"
              inputMode="search"
            />
          </div>
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Filtros"
                className={cn("relative h-11 w-11 shrink-0 rounded-xl", (filter !== "all" || scope !== "all") && "text-primary")}
              >
                <Filter className="h-5 w-5" />
                {(filter !== "all" || scope !== "all") && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 pb-6">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {statusFilters.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={cn(
                          "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
                          filter === f.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 text-foreground",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Escopo</p>
                  <div className="flex flex-wrap gap-2">
                    {scopeFilters.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setScope(f.value)}
                        className={cn(
                          "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
                          scope === f.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 text-foreground",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button className="h-11 w-full rounded-xl" onClick={() => setFilterOpen(false)}>
                  Aplicar
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="mt-2">
          <InboxTabs value={tab} onChange={setTab} unreadCount={totalUnread} size="md" />
        </div>
      </div>


      {/* Scrollable list */}
      <div
        className="momentum-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={(e) => {
          // simple pull-to-refresh at top
          const el = e.currentTarget;
          if (el.scrollTop === 0 && !isRefetching) {
            // noop; the browser handles overscroll cue
          }
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-muted-foreground">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <InboxIcon className="h-6 w-6" />
            </div>
            <p className="text-[15px] font-medium text-foreground">Sem conversas</p>
            <p className="text-sm">Aguarde novos inbounds ou crie contatos no CRM.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-2">
              Atualizar
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {conversations.map((c) => {
              const contact = c.contact as { name: string; phone?: string | null } | null;
              const assignedType = (c as { assigned_type?: string }).assigned_type ?? "unassigned";
              const assignedAgent = (c as { assigned_agent?: { name?: string | null } | null }).assigned_agent ?? null;
              const initial = contact?.name?.charAt(0).toUpperCase() ?? "?";
              return (
                <li key={c.id}>
                  <ConversationActions
                    conversation={{ ...c, contact }}
                    triggerClassName="right-3"
                    trigger={<ConversationMenuButton className="opacity-100" />}
                  >
                    <Link
                      to="/inbox/$conversationId"
                      params={{ conversationId: c.id }}
                      preload="intent"
                      className="flex w-full items-center gap-3 px-4 py-3 pr-14 active:bg-accent/60"
                    >
                      <div className="relative shrink-0">
                        <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-primary text-[15px] font-semibold text-primary-foreground ring-1 ring-border/40">
                          {initial}
                        </div>
                        {assignedType === "ai_agent" && (
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                            <Bot className="h-3 w-3" />
                          </span>
                        )}
                        {assignedType === "agent_user" && (
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-success text-success-foreground ring-2 ring-background">
                            <User className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[15px] font-semibold text-foreground">{contact?.name ?? "—"}</p>
                          <span className={cn("shrink-0 text-[11px] font-medium", c.unread_count > 0 ? "text-primary" : "text-muted-foreground")}>
                            {formatRelative(c.last_message_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {c.pinned && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                          <p
                            className={cn(
                              "min-w-0 flex-1 truncate text-[13px]",
                              c.unread_count > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {c.last_message_preview ?? "—"}
                          </p>
                          {c.unread_count > 0 ? (
                            <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground shadow-none">
                              {c.unread_count}
                            </Badge>
                          ) : (
                            <CheckCheck className="ml-auto h-3.5 w-3.5 shrink-0 text-info/70" />
                          )}
                        </div>
                        {assignedType === "ai_agent" && assignedAgent?.name && (
                          <p className="mt-0.5 truncate text-[11px] font-medium text-primary/80">
                            IA · {assignedAgent.name}
                          </p>
                        )}
                      </div>
                    </Link>
                  </ConversationActions>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
