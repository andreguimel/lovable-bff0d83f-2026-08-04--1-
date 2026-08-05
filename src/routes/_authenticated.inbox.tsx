import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, Star, Search, Inbox as InboxIcon, Bot, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";
import { listConversations } from "@/lib/inbox.functions";
import { formatRelative } from "@/lib/format";
import { useRealtimeConversations } from "@/hooks/use-realtime-messages";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileConversationList } from "@/components/inbox/mobile/mobile-conversation-list";
import { ConversationActions, ConversationMenuButton } from "@/components/inbox/conversation-actions";
import { InboxTabs, type InboxTab } from "@/components/inbox/inbox-tabs";
import {
  ConversationListSkeleton,
  InboxListFilters,
  type InboxSort,
} from "@/components/inbox/inbox-list-filters";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Zenda" }] }),
  component: InboxLayout,
});

function InboxLayout() {
  const params = useParams({ strict: false }) as { conversationId?: string };
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "resolved">("all");
  const [scope, setScope] = useState<"all" | "mine" | "unassigned">("all");
  const [sort, setSort] = useState<InboxSort>("recent");
  const [tab, setTab] = useState<InboxTab>("all");
  const [channelId, setChannelId] = useState<string | "all">("all");
  const list = useServerFn(listConversations);

  useRealtimeConversations();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: allConversations = [], isLoading } = useQuery({
    queryKey: ["conversations", filter, scope, debouncedQ],
    queryFn: () => list({ data: { status: filter, search: debouncedQ, scope } }),
    enabled: !isMobile,
  });

  const channels = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allConversations) {
      const ch = (c as { channel?: { id?: string; name?: string | null } | null }).channel;
      if (ch?.id) map.set(ch.id, ch.name ?? "Canal sem nome");
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allConversations]);

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
    if (channelId !== "all") {
      rows = rows.filter((c) => (c as { channel_id?: string | null }).channel_id === channelId);
    }
    const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);
    const sorted = [...rows];
    if (tab === "recent") {
      sorted.sort((a, b) => time(b.last_message_at) - time(a.last_message_at));
    } else if (sort === "oldest") {
      sorted.sort((a, b) => time(a.last_message_at) - time(b.last_message_at));
    } else if (sort === "unread") {
      sorted.sort(
        (a, b) =>
          (b.unread_count ?? 0) - (a.unread_count ?? 0) || time(b.last_message_at) - time(a.last_message_at),
      );
    }
    return sorted;
  }, [allConversations, tab, channelId, sort]);

  const totalUnread = useMemo(
    () => allConversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0),
    [allConversations],
  );

  const activeFilterCount =
    (sort !== "recent" ? 1 : 0) +
    (filter !== "all" ? 1 : 0) +
    (scope !== "all" ? 1 : 0) +
    (channelId !== "all" ? 1 : 0);




  // Mobile: full-width list when no conversation is selected, full-width
  // Outlet (conversation view) when one is selected. The list column and
  // desktop empty-state placeholder are hidden — the mobile shell also
  // hides its top bar and bottom nav on /inbox/<id> for a native feel.
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full">
        {params.conversationId ? (
          <div className="flex h-full min-h-0 w-full flex-col">
            <Outlet />
          </div>
        ) : (
          <MobileConversationList />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="hidden shrink-0 md:block md:w-[300px] lg:w-[340px] xl:w-[360px]">

        <aside className="flex h-full min-h-0 flex-col bg-sidebar/40">
          {/* Sticky header */}
          <div className="shrink-0 border-b border-border/50 px-4 pb-3 pt-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-[15px] font-semibold tracking-tight">Inbox</h2>
                <p className="text-[11px] text-muted-foreground">
                  {conversations.length} {conversations.length === 1 ? "conversa" : "conversas"}
                  {totalUnread > 0 && ` · ${totalUnread} não lidas`}
                </p>
              </div>
              <InboxListFilters
                sort={sort}
                onSortChange={setSort}
                status={filter}
                onStatusChange={setFilter}
                scope={scope}
                onScopeChange={setScope}
                channelId={channelId}
                onChannelChange={setChannelId}
                channels={channels}
                activeCount={activeFilterCount}
                onReset={() => {
                  setSort("recent");
                  setFilter("all");
                  setScope("all");
                  setChannelId("all");
                }}
              />
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar conversas"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-9 rounded-lg border-border/60 bg-background pl-9 text-sm shadow-none"
              />
            </div>
            <div className="mt-3">
              <InboxTabs value={tab} onChange={setTab} unreadCount={totalUnread} />
            </div>

          </div>

          {/* Independent scroll */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {isLoading ? (
              <ConversationListSkeleton />
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                  <InboxIcon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {debouncedQ || activeFilterCount > 0 ? "Nenhuma conversa encontrada" : "Sem conversas"}
                </p>
                <p className="text-xs">
                  {debouncedQ || activeFilterCount > 0
                    ? "Ajuste a busca ou limpe os filtros."
                    : "Crie contatos no CRM ou aguarde inbounds."}
                </p>
              </div>

            ) : (
              <ul className="space-y-0.5">
                {conversations.map((c) => {
                  const contact = c.contact as { name: string; phone?: string | null } | null;
                  const assignedType = (c as { assigned_type?: string }).assigned_type ?? "unassigned";
                  const assignedAgent = (c as { assigned_agent?: { name?: string | null } | null }).assigned_agent ?? null;
                  const active = params.conversationId === c.id;
                  const initial = contact?.name?.charAt(0).toUpperCase() ?? "?";
                  return (
                    <li key={c.id}>
                      <ConversationActions
                        conversation={{ ...c, contact }}
                        trigger={<ConversationMenuButton className="opacity-100" />}
                      >
                        <Link
                          to="/inbox/$conversationId"
                          params={{ conversationId: c.id }}
                          preload="intent"
                          className={cn("conv-item pr-11", active && "conv-item-active")}
                        >
                          <div className="relative shrink-0">
                            <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-primary text-[13px] font-semibold text-primary-foreground ring-1 ring-border/40">
                              {initial}
                            </div>
                            {assignedType === "ai_agent" && (
                              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-sidebar">
                                <Bot className="h-2.5 w-2.5" />
                              </span>
                            )}
                            {assignedType === "agent_user" && (
                              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-success text-success-foreground ring-2 ring-sidebar">
                                <User className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[13px] font-semibold text-foreground">{contact?.name ?? "—"}</p>
                              <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                                {formatRelative(c.last_message_at)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {c.pinned && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                              <p
                                className={cn(
                                  "min-w-0 flex-1 truncate text-[12px]",
                                  c.unread_count > 0
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {c.last_message_preview ?? "—"}
                              </p>
                              {c.unread_count > 0 ? (
                                <Badge className="ml-auto h-4.5 min-w-4.5 justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground shadow-none">
                                  {c.unread_count}
                                </Badge>
                              ) : (
                                <CheckCheck className="ml-auto h-3 w-3 shrink-0 text-info/70" />
                              )}
                            </div>
                            {assignedType === "ai_agent" && assignedAgent?.name && (
                              <p className="mt-1 truncate text-[10px] font-medium text-primary/80">
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
        </aside>
      </div>

      <div className="w-px shrink-0 bg-border/50" />

      <div className="flex min-h-0 min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={params.conversationId ?? "empty"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex h-full min-h-0 min-w-0 flex-1"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

