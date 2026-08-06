import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  CheckCircle2,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
  Bot,
  UserCog,
  User as UserIcon,
  X,
  PanelRight,
  ChevronDown,
  Sparkles,
  Trash2,
  MoreVertical,
  Workflow,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getConversation,
  listMessages,
  markAsRead,
  updateConversation,
  assignConversation,
  listCompanyMembers,
  listActiveAgents,
  maybeAutoRespondWithAgent,
  toggleMessageReaction,
} from "@/lib/inbox.functions";
import {
  deleteMessages,
  getConversationDeleteCapabilities,
} from "@/lib/message-delete.functions";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MessageComposer } from "@/components/inbox/message-composer";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { CallButton } from "@/components/inbox/call-button";
import { MediaImage, MediaAudio, MediaFile, MediaVideo } from "@/components/inbox/media";
import { MessageActions, type DeleteAction } from "@/components/inbox/message-actions";
import { SelectionToolbar } from "@/components/inbox/selection-toolbar";
import { DeleteMessageDialog } from "@/components/inbox/delete-message-dialog";
import { usePermission } from "@/hooks/usePermissions";
import { P } from "@/lib/rbac/registry";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileConversationHeader } from "@/components/inbox/mobile/mobile-conversation-header";
import { MobileContactSheet } from "@/components/inbox/mobile/mobile-contact-sheet";
import { MobileAssignSheet } from "@/components/inbox/mobile/mobile-assign-sheet";
import { MobileMessageComposer } from "@/components/inbox/mobile/mobile-message-composer";
import { MobileMessageActionsSheet } from "@/components/inbox/mobile/mobile-message-actions-sheet";
import { MobileSelectionBar } from "@/components/inbox/mobile/mobile-selection-bar";
import { ReplyPreview, type ReplyPreviewMessage, summarize as summarizeReply } from "@/components/inbox/reply-preview";
import { ForwardDialog } from "@/components/inbox/forward-dialog";
import { MessageInfoSheet } from "@/components/inbox/message-info-sheet";
import { InternalNotesSheet } from "@/components/inbox/internal-notes-sheet";
import { StickyNote } from "lucide-react";
void ReplyPreview;
void summarizeReply;

function MessageStatusIcon({
  status,
  isOutbound,
  isDeleted,
}: {
  status?: string | null;
  isOutbound: boolean;
  isDeleted: boolean;
}) {
  if (!isOutbound || isDeleted) return null;
  if (status === "sending" || status === "pending") {
    return (
      <span title="Enviando...">
        <Clock className="h-3 w-3 animate-spin opacity-70" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span title="Falha no envio">
        <AlertCircle className="h-3 w-3 text-red-400" />
      </span>
    );
  }
  if (status === "read") {
    return (
      <span title="Lida">
        <CheckCheck className="h-3.5 w-3.5 text-sky-400 font-semibold" />
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span title="Entregue">
        <CheckCheck className="h-3.5 w-3.5 opacity-80" />
      </span>
    );
  }
  return (
    <span title="Enviada">
      <Check className="h-3.5 w-3.5 opacity-80" />
    </span>
  );
}



export const Route = createFileRoute("/_authenticated/inbox/$conversationId")({
  component: ConversationView,
});

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  type: "text" | "image" | "audio" | "video" | "file";
  body: string | null;
  media_url: string | null;
  media_metadata: unknown;
  created_at: string;
  reply_to_id?: string | null;
  deleted_at?: string | null;
  deleted_scope?: "inbox_only" | "for_me" | "for_everyone" | null;
  deleted_by?: string | null;
  deleted_reason?: string | null;
  channel_id?: string | null;
  channel?: { id: string; name: string; phone_number: string | null } | null;
};

function ConversationView() {
  const { conversationId } = useParams({ from: "/_authenticated/inbox/$conversationId" });
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const isMobile = useIsMobile();
  const [mobileContactOpen, setMobileContactOpen] = useState(false);
  const [mobileAssignOpen, setMobileAssignOpen] = useState(false);
  const [mobileSheetMsg, setMobileSheetMsg] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyPreviewMessage | null>(null);
  const [forwardingIds, setForwardingIds] = useState<string[] | null>(null);
  const [infoMessageId, setInfoMessageId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const { data: currentUser } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60_000,
  });

  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; moved: boolean; startX: number; startY: number }>({
    timer: null,
    moved: false,
    startX: 0,
    startY: 0,
  });

  const getConv = useServerFn(getConversation);
  const listMsg = useServerFn(listMessages);
  const markRead = useServerFn(markAsRead);
  const updConv = useServerFn(updateConversation);
  const assignConv = useServerFn(assignConversation);
  const listMembersFn = useServerFn(listCompanyMembers);
  const listAgentsFn = useServerFn(listActiveAgents);
  const autoRespond = useServerFn(maybeAutoRespondWithAgent);
  const toggleReaction = useServerFn(toggleMessageReaction);

  const reactMut = useMutation({
    mutationFn: (input: { messageId: string; emoji: string }) =>
      toggleReaction({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getConv({ data: { id: conversationId } }),
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => listMsg({ data: { conversationId } }),
  });

  const assignedType = (convData?.conversation as { assigned_type?: string } | undefined)?.assigned_type;
  const isAgentAssigned = assignedType === "ai_agent";

  const onNewInbound = useCallback(() => {
    if (!isAgentAssigned) return;
    autoRespond({ data: { conversationId } })
      .then((r) => {
        if (r.ok) {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Falha na auto-resposta"));
  }, [isAgentAssigned, autoRespond, conversationId, qc]);

  useRealtimeMessages(conversationId, { onNewInbound });

  useEffect(() => {
    if (!conversationId) return;
    const unread = (convData?.conversation as { unread_count?: number } | undefined)?.unread_count ?? 0;
    if (unread <= 0) return;
    markRead({ data: { conversationId } })
      .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))
      .catch(() => {});
  }, [conversationId, markRead, qc, convData]);

  // Smart auto-scroll — only if near bottom
  const nearBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = distance < 120;
      nearBottomRef.current = near;
      setShowJumpButton(!near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // CRITICAL-01 P3: ao trocar de conversa, resetar "perto do fim" para true
  // e forçar scroll ao fim sem animação. Sem isso, a conversa abre no topo.
  useLayoutEffect(() => {
    nearBottomRef.current = true;
    setShowJumpButton(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId]);

  useLayoutEffect(() => {
    if (!nearBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    // Instantâneo enquanto histórico entra; suave só para novas mensagens.
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [messages.length]);

  // CRITICAL-01 P3: reancorar no fim conforme o conteúdo cresce (imagens/áudios
  // sendo carregados, transcrições expandindo, etc.). ResizeObserver dispara
  // sempre que scrollHeight muda — cobre casos que `load` bubble não pega.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    // Observar todos os filhos diretos (mensagens) — capta expansão de mídia
    for (const child of Array.from(el.children)) ro.observe(child);
    // E o próprio wrapper interno, caso exista
    ro.observe(el);
    return () => ro.disconnect();
  }, [conversationId, messages.length]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("inbox:open-transfer"));
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        document.getElementById("inbox-composer-textarea")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const statusMut = useMutation({
    mutationFn: (status: "open" | "pending" | "resolved") =>
      updConv({ data: { id: conversationId, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Status atualizado");
    },
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const { data: members = [] } = useQuery({
    queryKey: ["company-members"],
    queryFn: () => listMembersFn(),
    enabled: assignOpen,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["active-agents"],
    queryFn: () => listAgentsFn(),
    enabled: assignOpen,
  });

  const assignMut = useMutation({
    mutationFn: (input: {
      mode: "unassigned" | "user" | "agent";
      userId?: string | null;
      agentId?: string | null;
    }) => assignConv({ data: { conversationId, ...input } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setAssignOpen(false);
      toast.success(r.mode === "unassigned" ? "Atribuição removida" : `Atribuído a ${r.label}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Delete / Selection state (Fase 3) ----
  const { allowed: canDelete } = usePermission(P.INBOX.DELETE);
  const capabilitiesFn = useServerFn(getConversationDeleteCapabilities);
  const deleteFn = useServerFn(deleteMessages);
  const { data: capabilities = null } = useQuery({
    queryKey: ["inbox", "delete-capabilities", conversationId],
    queryFn: () => capabilitiesFn({ data: { conversationId } }),
    enabled: !!conversationId,
    staleTime: 5 * 60_000,
  });
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{
    scope: DeleteAction;
    ids: string[];
  } | null>(null);

  const clearSelection = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelectWith = useCallback((id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  }, []);

  const deleteMut = useMutation({
    mutationFn: (input: { ids: string[]; scope: DeleteAction }) =>
      deleteFn({
        data: {
          conversationId,
          messageIds: input.ids,
          scope: input.scope,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setPendingDelete(null);
      clearSelection();
      if (res.failed === 0) {
        toast.success(
          res.total === 1
            ? "Mensagem excluída"
            : `${res.succeeded} mensagens excluídas`,
        );
      } else if (res.succeeded === 0) {
        toast.error(
          `Falha ao excluir: ${res.outcomes[0]?.error ?? "erro desconhecido"}`,
        );
      } else {
        toast.warning(
          `${res.succeeded} excluídas, ${res.failed} falharam.`,
        );
      }
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPendingDelete(null);
    },
  });

  // Keyboard shortcut — Delete key when in select mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
      if (inField) return;
      if (e.key === "Escape" && selectMode) {
        e.preventDefault();
        clearSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectMode && selected.size > 0) {
        e.preventDefault();
        if (!canDelete) return;
        setPendingDelete({ scope: "for_me", ids: Array.from(selected) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, selected, canDelete, clearSelection]);

  // Group messages by date + collapse consecutive same-author
  const groups = useMemo(() => groupMessages(messages as Message[]), [messages]);
  const messagesById = useMemo(() => {
    const m = new Map<string, Message>();
    for (const msg of messages as Message[]) m.set(msg.id, msg);
    return m;
  }, [messages]);

  const startReply = useCallback((m: Message) => {
    setReplyingTo({
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: m.body,
      media_metadata: m.media_metadata,
    });
    setTimeout(() => document.getElementById("inbox-composer-textarea")?.focus(), 30);
  }, []);



  if (convLoading || !convData) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const conv = convData.conversation as {
    id: string;
    status: "open" | "pending" | "resolved";
    channel_id: string;
    transferred_from_channel_id: string | null;
    transferred_at: string | null;
    assigned_type: "unassigned" | "agent_user" | "ai_agent";
    assigned_user_id: string | null;
    assigned_agent_id: string | null;
    contact: { id: string; name: string; phone: string | null; email: string | null; notes: string | null; avatar_url: string | null };
    channel: { id: string; name: string; phone_number: string | null };
    transferred_from: { id: string; name: string } | null;
    assigned_user: { id: string; full_name: string | null; avatar_url: string | null } | null;
    assigned_agent: { id: string; name: string; avatar_url: string | null } | null;
  };

  const assigneeLabel =
    conv.assigned_type === "ai_agent"
      ? conv.assigned_agent?.name ?? "Agente IA"
      : conv.assigned_type === "agent_user"
        ? conv.assigned_user?.full_name ?? "Atendente"
        : "Não atribuída";

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-background">
        {selectMode ? (
          <MobileSelectionBar
            count={selected.size}
            anyOutbound={(messages as Message[]).some((m) => selected.has(m.id) && m.direction === "outbound")}
            allOutbound={
              selected.size > 0 &&
              (messages as Message[]).every((m) => !selected.has(m.id) || m.direction === "outbound")
            }
            bodies={(messages as Message[]).filter((m) => selected.has(m.id)).map((m) => m.body ?? "")}
            capabilities={capabilities}
            canDelete={canDelete}
            onCancel={clearSelection}
            onForward={() => selected.size > 0 && setForwardingIds(Array.from(selected))}
            onDelete={(scope) => setPendingDelete({ scope, ids: Array.from(selected) })}
          />

        ) : (
          <MobileConversationHeader
            conversationId={conv.id}
            contactName={conv.contact.name}
            contactPhone={conv.contact.phone}
            channelName={conv.channel.name}
            status={conv.status}
            onOpenContact={() => setMobileContactOpen(true)}
            onOpenAssign={() => setMobileAssignOpen(true)}
            onToggleStatus={() => statusMut.mutate(conv.status === "resolved" ? "open" : "resolved")}
          />
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="momentum-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-1.5 px-3 py-3">
              {messages.length === 0 && (
                <div className="py-16 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-[15px] font-medium">Comece a conversa</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Envie a primeira mensagem para {conv.contact.name.split(" ")[0]}.
                  </p>
                </div>
              )}

              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <div className="my-2 flex items-center justify-center">
                    <span className="date-pill">{group.dateLabel}</span>
                  </div>
                  {group.clusters.map((cluster) => (
                    <div key={cluster.key} className={cn("flex w-full", cluster.outbound ? "justify-end" : "justify-start")}>
                      <div className={cn("flex max-w-[85%] flex-col gap-1", cluster.outbound ? "items-end" : "items-start")}>
                        {cluster.automated && (
                          <div className="mb-0.5 inline-flex items-center gap-1.5 pl-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/15">
                              <Bot className="h-2.5 w-2.5" />
                            </span>
                            {cluster.automationLabel}
                          </div>
                        )}
                        {cluster.messages.map((m, i) => {
                          const meta = (m.media_metadata as { name?: string; size?: number; duration?: number; reaction?: string; is_group?: boolean; sender_name?: string; sender_phone?: string } | null) ?? null;
                          const isLast = i === cluster.messages.length - 1;
                          const isDeleted = !!m.deleted_at;
                          const isSelected = selected.has(m.id);

                          const startLongPress = () => {
                            if (isDeleted) return;
                            longPressRef.current.moved = false;
                            if (longPressRef.current.timer) clearTimeout(longPressRef.current.timer);
                            longPressRef.current.timer = setTimeout(() => {
                              if (longPressRef.current.moved) return;
                              if (selectMode) {
                                toggleSelected(m.id);
                              } else {
                                setMobileSheetMsg(m);
                              }
                            }, 420);
                          };
                          const cancelLongPress = () => {
                            if (longPressRef.current.timer) {
                              clearTimeout(longPressRef.current.timer);
                              longPressRef.current.timer = null;
                            }
                          };

                          return (
                            <div
                              key={m.id}
                              className={cn(
                                "flex items-center gap-2 rounded-lg transition-colors",
                                cluster.outbound ? "flex-row-reverse" : "flex-row",
                                isSelected && "bg-primary/10 px-1 py-0.5",
                              )}
                              onClick={() => {
                                if (selectMode && !isDeleted) toggleSelected(m.id);
                              }}
                            >
                              {selectMode && !isDeleted && (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelected(m.id)}
                                  aria-label="Selecionar mensagem"
                                  className="shrink-0"
                                />
                              )}
                              <div
                                onPointerDown={(e) => {
                                  longPressRef.current.startX = e.clientX;
                                  longPressRef.current.startY = e.clientY;
                                  startLongPress();
                                }}
                                onPointerMove={(e) => {
                                  const dx = Math.abs(e.clientX - longPressRef.current.startX);
                                  const dy = Math.abs(e.clientY - longPressRef.current.startY);
                                  if (dx > 8 || dy > 8) {
                                    longPressRef.current.moved = true;
                                    cancelLongPress();
                                  }
                                }}
                                onPointerUp={cancelLongPress}
                                onPointerCancel={cancelLongPress}
                                onContextMenu={(e) => {
                                  // Prevent native long-press menu on mobile.
                                  e.preventDefault();
                                }}
                                className={cn(
                                  "animate-bubble-in relative px-3.5 py-2 text-[14.5px] leading-[1.4] shadow-sm select-none",
                                  cluster.outbound
                                    ? cluster.automated
                                      ? "msg-bubble-ai"
                                      : "msg-bubble-out"
                                    : "msg-bubble-in",
                                  cluster.outbound && !isLast && "rounded-br-[10px]",
                                  !cluster.outbound && !isLast && "rounded-bl-[10px]",
                                  isDeleted && "italic opacity-60",
                                )}
                                style={{ WebkitTouchCallout: "none" }}
                              >
                                {isDeleted ? (
                                  <p className="whitespace-pre-wrap break-words">
                                    Mensagem excluída
                                  </p>
                                ) : (
                                  <>
                                    {!cluster.outbound && (meta?.sender_name || meta?.sender_phone) && (
                                      <p className="mb-0.5 text-[11px] font-semibold text-primary/90">
                                        {meta.sender_name ?? meta.sender_phone}
                                      </p>
                                    )}
                                    {m.type === "text" && (
                                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                    )}
                                    {m.type === "image" && m.media_url && <MediaImage path={m.media_url} messageId={m.id} />}
                                    {m.type === "audio" && m.media_url && (
                                      <div className={cn("min-w-[220px]", cluster.outbound && !cluster.automated ? "text-primary-foreground" : "text-foreground")}>
                                        <MediaAudio path={m.media_url} messageId={m.id} />
                                      </div>
                                    )}
                                    {m.type === "video" && m.media_url && <MediaVideo path={m.media_url} messageId={m.id} />}
                                    {m.type === "file" && m.media_url && (
                                      <MediaFile path={m.media_url} messageId={m.id} name={meta?.name} size={meta?.size} />
                                    )}

                                    {meta?.reaction && (
                                      <span className="absolute -bottom-2 -right-1 flex items-center justify-center rounded-full bg-card px-1.5 py-0.5 text-xs shadow ring-1 ring-border/50">
                                        {meta.reaction}
                                      </span>
                                    )}
                                  </>
                                )}
                                {isLast && (
                                  <div
                                    className={cn(
                                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                                      cluster.outbound && !cluster.automated
                                        ? "text-primary-foreground/70"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {m.channel?.name && (
                                      <span
                                        className={cn(
                                          "mr-1 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-[1px] text-[9px] font-medium",
                                          cluster.outbound && !cluster.automated
                                            ? "border-primary-foreground/30 bg-primary-foreground/10"
                                            : "border-border/60 bg-muted/40",
                                        )}
                                        title={`Canal: ${m.channel.name}${m.channel.phone_number ? ` (${m.channel.phone_number})` : ""}`}
                                      >
                                        {m.channel.name}
                                      </span>
                                    )}
                                    <ClientTime iso={m.created_at} />
                                    <MessageStatusIcon status={(m as { status?: string | null }).status} isOutbound={cluster.outbound} isDeleted={isDeleted} />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {showJumpButton && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-card/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Novas mensagens
            </button>
          )}
        </div>

        <ComposerWrapper
          conversationId={conversationId}
          contactName={conv.contact.name}
          mobile
          replyingTo={replyingTo}
          onClearReply={() => setReplyingTo(null)}
        />

        <MobileContactSheet
          open={mobileContactOpen}
          onOpenChange={setMobileContactOpen}
          contact={conv.contact}
          tags={convData.tags}
          channelName={conv.channel.name}
          conversationId={conversationId}
          assigneeLabel={assigneeLabel}
          assigneeType={conv.assigned_type}
          status={conv.status}
        />
        <MobileAssignSheet
          open={mobileAssignOpen}
          onOpenChange={setMobileAssignOpen}
          conversationId={conversationId}
          assignedType={conv.assigned_type}
          assignedUserId={conv.assigned_user_id}
          assignedAgentId={conv.assigned_agent_id}
        />

        <MobileMessageActionsSheet
          open={!!mobileSheetMsg}
          onOpenChange={(v) => !v && setMobileSheetMsg(null)}
          message={
            mobileSheetMsg
              ? {
                  id: mobileSheetMsg.id,
                  body: mobileSheetMsg.body,
                  outbound: mobileSheetMsg.direction === "outbound",
                  deleted: !!mobileSheetMsg.deleted_at,
                  type: mobileSheetMsg.type,
                  media_metadata: mobileSheetMsg.media_metadata,
                }
              : null
          }
          capabilities={capabilities}
          canDelete={canDelete}
          onReply={() => {
            if (!mobileSheetMsg) return;
            setReplyingTo({
              id: mobileSheetMsg.id,
              direction: mobileSheetMsg.direction,
              type: mobileSheetMsg.type,
              body: mobileSheetMsg.body,
              media_metadata: mobileSheetMsg.media_metadata,
            });
            setMobileSheetMsg(null);
            setTimeout(() => document.getElementById("inbox-composer-textarea")?.focus(), 50);
          }}
          onForward={(id) => {
            setForwardingIds([id]);
            setMobileSheetMsg(null);
          }}
          onInfo={(id) => {
            setInfoMessageId(id);
            setMobileSheetMsg(null);
          }}
          onReact={(id, emoji) => reactMut.mutate({ messageId: id, emoji })}
          onEnterSelect={(id) => enterSelectWith(id)}
          onDelete={(id, scope) => setPendingDelete({ scope, ids: [id] })}
        />

        <MessageInfoSheet
          messageId={infoMessageId}
          open={!!infoMessageId}
          onOpenChange={(v) => !v && setInfoMessageId(null)}
          mobile
        />


        <DeleteMessageDialog
          open={!!pendingDelete}
          scope={pendingDelete?.scope ?? null}
          count={pendingDelete?.ids.length ?? 0}
          capabilities={capabilities}
          loading={deleteMut.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (!pendingDelete) return;
            deleteMut.mutate({ ids: pendingDelete.ids, scope: pendingDelete.scope });
          }}
        />

        <ForwardDialog
          open={!!forwardingIds}
          onOpenChange={(v) => !v && setForwardingIds(null)}
          sourceMessageIds={forwardingIds ?? []}
          currentConversationId={conversationId}
          onDone={clearSelection}
        />
      </div>

    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Conversation column */}
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
        {/* Sticky header */}
        <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border/50 bg-background/85 px-6 backdrop-blur-xl">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-primary text-sm font-semibold text-primary-foreground ring-1 ring-border/50">
            {conv.contact.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[14px] font-semibold text-foreground">{conv.contact.name}</p>
            </div>

            <p className="truncate text-[11px] text-muted-foreground">
              {conv.contact.phone ?? "sem telefone"} · via {conv.channel.name}
              {conv.transferred_from && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary/80">
                  <ArrowRightLeft className="h-3 w-3" />
                  transferida de {conv.transferred_from.name}
                </span>
              )}
            </p>
          </div>


          <CallButton conversationId={conv.id} phone={conv.contact.phone} contactName={conv.contact.name} variant="button" />

          <Popover open={assignOpen} onOpenChange={setAssignOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs">
                {conv.assigned_type === "ai_agent" ? (
                  <Bot className="h-3.5 w-3.5 text-primary" />
                ) : conv.assigned_type === "agent_user" ? (
                  <UserIcon className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <UserCog className="h-3.5 w-3.5" />
                )}
                <span className="max-w-[120px] truncate">{assigneeLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <Tabs defaultValue={conv.assigned_type === "ai_agent" ? "agents" : "users"}>
                <TabsList className="w-full">
                  <TabsTrigger value="users" className="flex-1">
                    <UserIcon className="mr-1 h-3.5 w-3.5" /> Humano
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="flex-1">
                    <Bot className="mr-1 h-3.5 w-3.5" /> IA
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="users" className="mt-2 max-h-64 overflow-y-auto">
                  {members.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">Carregando…</p>
                  ) : (
                    members.map((m) => (
                      <button
                        key={m.id}
                        disabled={assignMut.isPending}
                        onClick={() => assignMut.mutate({ mode: "user", userId: m.id })}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50",
                          conv.assigned_user_id === m.id && "bg-accent",
                        )}
                      >
                        <div className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                          {(m.full_name ?? m.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{m.full_name ?? m.email ?? "—"}</p>
                          {m.email && <p className="truncate text-[10px] text-muted-foreground">{m.email}</p>}
                        </div>
                      </button>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="agents" className="mt-2 max-h-64 overflow-y-auto">
                  {agents.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">Nenhum agente ativo.</p>
                  ) : (
                    agents.map((a) => (
                      <button
                        key={a.id}
                        disabled={assignMut.isPending}
                        onClick={() => assignMut.mutate({ mode: "agent", agentId: a.id })}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50",
                          conv.assigned_agent_id === a.id && "bg-accent",
                        )}
                      >
                        <Bot className="h-4 w-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{a.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{a.model}</p>
                        </div>
                      </button>
                    ))
                  )}
                </TabsContent>
              </Tabs>
              {conv.assigned_type !== "unassigned" && (
                <>
                  <div className="my-2 border-t border-border" />
                  <button
                    disabled={assignMut.isPending}
                    onClick={() => assignMut.mutate({ mode: "unassigned" })}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Remover atribuição
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>

          {conv.status !== "resolved" ? (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs" onClick={() => statusMut.mutate("resolved")}>
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Resolver
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs" onClick={() => statusMut.mutate("open")}>
              <ArrowRight className="h-3.5 w-3.5" /> Reabrir
            </Button>
          )}
          <Badge
            variant="outline"
            className={cn(
              "hidden h-7 rounded-full border-transparent px-2.5 text-[11px] font-medium xl:inline-flex",
              conv.status === "open" && "bg-success/12 text-success",
              conv.status === "pending" && "bg-warning/15 text-warning",
              conv.status === "resolved" && "bg-muted text-muted-foreground",
            )}
          >
            {conv.status === "open" ? "Aberta" : conv.status === "pending" ? "Pendente" : "Resolvida"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            aria-label="Notas internas"
            title="Notas internas"
            onClick={() => setNotesOpen(true)}
          >
            <StickyNote className="h-4 w-4 text-amber-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            aria-label={showPanel ? "Ocultar painel" : "Mostrar painel"}
            onClick={() => setShowPanel((v) => !v)}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </header>

        {selectMode && (
          <SelectionToolbar
            count={selected.size}
            anyOutbound={(messages as Message[]).some(
              (m) => selected.has(m.id) && m.direction === "outbound",
            )}
            allOutbound={
              selected.size > 0 &&
              (messages as Message[])
                .filter((m) => selected.has(m.id))
                .every((m) => m.direction === "outbound")
            }
            capabilities={capabilities}
            canDelete={canDelete}
            onCancel={clearSelection}
            onForward={() => selected.size > 0 && setForwardingIds(Array.from(selected))}
            onDelete={(scope) => {
              if (selected.size === 0) return;
              setPendingDelete({ scope, ids: Array.from(selected) });
            }}

          />
        )}

        {/* Messages scroll area */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[780px] flex-col gap-2 px-6 py-8">
              {messages.length === 0 && (
                <div className="py-16 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-medium">Comece a conversa</p>
                  <p className="mt-1 text-xs text-muted-foreground">Envie a primeira mensagem para {conv.contact.name.split(" ")[0]}.</p>
                </div>
              )}

              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                  <div className="my-3 flex items-center justify-center gap-3">
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="date-pill">{group.dateLabel}</span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>

                  {group.clusters.map((cluster) => (
                    <div key={cluster.key} className={cn("flex w-full", cluster.outbound ? "justify-end" : "justify-start")}>
                      <div className={cn("flex max-w-[70%] flex-col gap-1", cluster.outbound ? "items-end" : "items-start")}>
                        {cluster.automated && (
                          <div className="mb-0.5 inline-flex items-center gap-1.5 pl-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/15">
                              <Bot className="h-2.5 w-2.5" />
                            </span>
                            {cluster.automationLabel}
                          </div>
                        )}
                        {cluster.messages.map((m, i) => {
                          const meta = (m.media_metadata as { name?: string; size?: number; duration?: number; reaction?: string; is_group?: boolean; sender_name?: string; sender_phone?: string } | null) ?? null;
                          const isLast = i === cluster.messages.length - 1;
                          const isDeleted = !!m.deleted_at;
                          const isSelected = selected.has(m.id);
                          const bubble = (
                            <div
                              className={cn(
                                "animate-bubble-in relative px-4 py-2.5 text-[14px] leading-[1.55] shadow-sm",
                                cluster.outbound
                                  ? cluster.automated
                                    ? "msg-bubble-ai"
                                    : "msg-bubble-out"
                                  : "msg-bubble-in",
                                cluster.outbound && !isLast && "rounded-br-[10px]",
                                !cluster.outbound && !isLast && "rounded-bl-[10px]",
                                isDeleted && "italic opacity-70",
                              )}
                            >
                              {isDeleted ? (
                                <p className="flex items-center gap-1.5 whitespace-pre-wrap break-words text-muted-foreground">
                                  <Trash2 className="h-3 w-3" />
                                  {m.deleted_scope === "for_everyone"
                                    ? "Esta mensagem foi apagada"
                                    : m.deleted_scope === "for_me"
                                      ? "Você apagou esta mensagem"
                                      : "Mensagem removida do inbox"}
                                </p>
                              ) : (
                                <>
                                  {!cluster.outbound && (meta?.sender_name || meta?.sender_phone) && (
                                    <p className="mb-0.5 text-[11px] font-semibold text-primary/90">
                                      {meta.sender_name ?? meta.sender_phone}
                                    </p>
                                  )}
                                  {m.reply_to_id && messagesById.get(m.reply_to_id) && (
                                    <QuotedMessage
                                      quoted={messagesById.get(m.reply_to_id)!}
                                      contactName={conv.contact.name}
                                      outbound={cluster.outbound}
                                    />
                                  )}
                                  {m.type === "text" && (
                                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                  )}
                                  {m.type === "image" && m.media_url && <MediaImage path={m.media_url} messageId={m.id} />}
                                  {m.type === "audio" && m.media_url && (
                                    <div className={cn("min-w-[240px]", cluster.outbound && !cluster.automated ? "text-primary-foreground" : "text-foreground")}>
                                      <MediaAudio path={m.media_url} messageId={m.id} />
                                    </div>
                                  )}
                                  {m.type === "video" && m.media_url && <MediaVideo path={m.media_url} messageId={m.id} />}
                                  {m.type === "file" && m.media_url && (
                                    <MediaFile path={m.media_url} messageId={m.id} name={meta?.name} size={meta?.size} />
                                  )}
                                  {meta && typeof meta.reaction === "string" && (
                                    <span className="absolute -bottom-2 -right-1 flex items-center justify-center rounded-full bg-card px-1.5 py-0.5 text-xs shadow ring-1 ring-border/50">
                                      {meta.reaction}
                                    </span>
                                  )}
                                </>
                              )}
                              {isLast && (
                                <div
                                  className={cn(
                                    "mt-1 flex items-center justify-end gap-1 text-[10px]",
                                    cluster.outbound && !cluster.automated
                                      ? "text-primary-foreground/70"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  <ClientTime iso={m.created_at} />
                                  <MessageStatusIcon status={(m as { status?: string | null }).status} isOutbound={cluster.outbound} isDeleted={isDeleted} />
                                </div>
                              )}
                            </div>
                          );
                          return (
                            <div
                              key={m.id}
                              className={cn(
                                "flex items-center gap-2",
                                cluster.outbound ? "flex-row-reverse" : "flex-row",
                                selectMode && "cursor-pointer",
                                isSelected && "rounded-lg bg-primary/5 px-1 py-0.5",
                              )}
                              onClick={
                                selectMode && !isDeleted
                                  ? () => toggleSelected(m.id)
                                  : undefined
                              }
                            >
                              {selectMode && !isDeleted && (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelected(m.id)}
                                  aria-label="Selecionar mensagem"
                                />
                              )}
                              <div className="max-w-full">
                                <MessageActions
                                  outbound={cluster.outbound}
                                  deleted={isDeleted}
                                  body={m.body}
                                  capabilities={capabilities}
                                  canDelete={canDelete}
                                  onReply={() => startReply(m)}
                                  onForward={() => setForwardingIds([m.id])}
                                  onInfo={() => setInfoMessageId(m.id)}
                                  onReact={(emoji) => reactMut.mutate({ messageId: m.id, emoji })}
                                  onEnterSelect={() => enterSelectWith(m.id)}

                                  onDelete={(scope) =>
                                    setPendingDelete({ scope, ids: [m.id] })
                                  }
                                >
                                  {bubble}
                                </MessageActions>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {showJumpButton && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-md transition-transform hover:scale-[1.02]"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Novas mensagens
            </button>
          )}
        </div>

        {/* Composer — sticky at bottom */}
        <div className="shrink-0 border-t border-border/40 bg-background/50 px-4 py-3 backdrop-blur">
          <div className="mx-auto w-full max-w-[780px]">
            <ComposerWrapper
              conversationId={conversationId}
              contactName={conv.contact.name}
              replyingTo={replyingTo}
              onClearReply={() => setReplyingTo(null)}
            />
          </div>
        </div>
      </section>

      {/* Contact panel */}
      {showPanel && (
        <ContactPanel
          contact={conv.contact}
          tags={convData.tags}
          channelName={conv.channel.name}
          conversationId={conversationId}
          assigneeLabel={assigneeLabel}
          assigneeType={conv.assigned_type}
          status={conv.status}
        />
      )}

      <DeleteMessageDialog
        open={!!pendingDelete}
        scope={pendingDelete?.scope ?? null}
        count={pendingDelete?.ids.length ?? 0}
        capabilities={capabilities}
        loading={deleteMut.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMut.mutate({ ids: pendingDelete.ids, scope: pendingDelete.scope });
        }}
      />

      <ForwardDialog
        open={!!forwardingIds}
        onOpenChange={(v) => !v && setForwardingIds(null)}
        sourceMessageIds={forwardingIds ?? []}
        currentConversationId={conversationId}
        onDone={clearSelection}
      />

      <MessageInfoSheet
        messageId={infoMessageId}
        open={!!infoMessageId}
        onOpenChange={(v) => !v && setInfoMessageId(null)}
      />

      <InternalNotesSheet
        open={notesOpen}
        onOpenChange={setNotesOpen}
        conversationId={conversationId}
        currentUserId={currentUser?.id ?? null}
      />
    </div>

  );
}

function ClientTime({ iso }: { iso: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span suppressHydrationWarning>—</span>;
  return <span>{formatTime(iso)}</span>;
}

function ComposerWrapper({
  conversationId,
  contactName,
  mobile,
  replyingTo,
  onClearReply,
}: {
  conversationId: string;
  contactName: string;
  mobile?: boolean;
  replyingTo?: import("@/components/inbox/reply-preview").ReplyPreviewMessage | null;
  onClearReply?: () => void;
}) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => {
    void supabase
      .from("conversations")
      .select("company_id")
      .eq("id", conversationId)
      .maybeSingle()
      .then(({ data }) => setCompanyId(data?.company_id ?? null));
  }, [conversationId]);
  if (!companyId) return <div className="h-[52px] animate-pulse rounded-2xl bg-muted/40" />;
  if (mobile)
    return (
      <MobileMessageComposer
        conversationId={conversationId}
        contactName={contactName}
        companyId={companyId}
        replyingTo={replyingTo}
        onClearReply={onClearReply}
      />
    );
  return (
    <MessageComposer
      conversationId={conversationId}
      contactName={contactName}
      companyId={companyId}
      replyingTo={replyingTo}
      onClearReply={onClearReply}
    />
  );
}

// --- helpers ---
type Cluster = {
  key: string;
  outbound: boolean;
  automated: boolean;
  automationLabel: string;
  messages: Message[];
};
type DateGroup = {
  key: string;
  dateLabel: string;
  clusters: Cluster[];
};

function groupMessages(messages: Message[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentDate = "";
  let dg: DateGroup | null = null;
  let cluster: Cluster | null = null;

  for (const m of messages) {
    const date = new Date(m.created_at);
    const dayKey = date.toDateString();
    if (dayKey !== currentDate) {
      currentDate = dayKey;
      dg = { key: dayKey, dateLabel: humanDate(date), clusters: [] };
      groups.push(dg);
      cluster = null;
    }
    const meta = (m.media_metadata as { automated?: boolean; agent_id?: string; flow_id?: string } | null) ?? null;
    const outbound = m.direction === "outbound";
    const automated = outbound && meta?.automated === true;
    const automationLabel = meta?.agent_id
      ? "Caroline IA · Automação"
      : meta?.flow_id
        ? "Fluxo automatizado"
        : "Automação";

    const clusterKey = `${outbound ? "o" : "i"}-${automated ? "a" : "h"}-${automationLabel}`;
    if (!cluster || cluster.key.split("|")[0] !== clusterKey) {
      cluster = {
        key: `${clusterKey}|${m.id}`,
        outbound,
        automated,
        automationLabel,
        messages: [],
      };
      dg!.clusters.push(cluster);
    }
    cluster.messages.push(m);
  }
  return groups;
}

function humanDate(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Quoted message rendered inside a reply bubble (WhatsApp Web look).
 * Compact preview: author + type icon + short body.
 */
function QuotedMessage({
  quoted,
  contactName,
  outbound,
}: {
  quoted: Message;
  contactName: string;
  outbound: boolean;
}) {
  const author = quoted.direction === "outbound" ? "Você" : contactName;
  const summary = summarizeReply({
    id: quoted.id,
    direction: quoted.direction,
    type: quoted.type,
    body: quoted.body,
    media_metadata: quoted.media_metadata,
  });
  return (
    <div
      className={cn(
        "mb-1.5 flex items-start gap-2 rounded-md border-l-[3px] px-2 py-1.5 text-[12px]",
        outbound
          ? "border-primary-foreground/70 bg-primary-foreground/10 text-primary-foreground/90"
          : "border-primary bg-muted/60 text-foreground",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[11px] font-semibold", outbound ? "text-primary-foreground" : "text-primary")}>
          {author}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate opacity-90">
          {summary.icon}
          <span className="truncate">{summary.text}</span>
        </p>
      </div>
    </div>
  );
}
