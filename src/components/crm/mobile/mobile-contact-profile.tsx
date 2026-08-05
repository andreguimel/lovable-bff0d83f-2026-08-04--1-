import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MessageSquare,
  MoreVertical,
  Clock,
  ListChecks,
  StickyNote,
  FolderOpen,
  Sparkles,
  Save,
  Trash2,
  Loader2,
  Copy,
  X,
  Plus,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientTime } from "@/components/client-time";
import { LeadScorePill, LeadScoreBar } from "@/components/crm/lead-score";
import { ContactTimeline } from "@/components/crm/contact-timeline";
import { STAGES } from "@/components/crm/views/kanban-view";
import { TasksTab } from "@/components/crm/profile/tabs/tasks-tab";
import { NotesTab } from "@/components/crm/profile/tabs/notes-tab";
import { IATab } from "@/components/crm/profile/tabs/ia-tab";
import { FilesTab } from "@/components/crm/profile/tabs/files-tab";
import {
  getContact,
  updateContact,
  deleteContacts,
  toggleContactTag,
  listChannels,
  startConversationFromContact,
} from "@/lib/crm.functions";
import { listTags } from "@/lib/inbox.functions";
import { cn } from "@/lib/utils";

type TabId =
  | "overview"
  | "timeline"
  | "conversations"
  | "tasks"
  | "notes"
  | "ia"
  | "files";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "timeline", label: "Timeline" },
  { id: "conversations", label: "Conversas" },
  { id: "tasks", label: "Tarefas" },
  { id: "notes", label: "Notas" },
  { id: "ia", label: "IA" },
  { id: "files", label: "Arquivos" },
];

const brl = (cents: number | null) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export function MobileContactProfile({ contactId }: { contactId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getContact);
  const tagsFn = useServerFn(listTags);
  const chFn = useServerFn(listChannels);
  const updateFn = useServerFn(updateContact);
  const delFn = useServerFn(deleteContacts);
  const toggleTag = useServerFn(toggleContactTag);
  const startConv = useServerFn(startConversationFromContact);

  const detail = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => getFn({ data: { id: contactId } }),
    retry: false,
  });
  const { data: allTags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => tagsFn() });
  const { data: channels = [] } = useQuery({ queryKey: ["channels"], queryFn: () => chFn() });

  const [tab, setTab] = useState<TabId>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [startChannel, setStartChannel] = useState("");
  const [startMessage, setStartMessage] = useState("");

  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateFn>[0]["data"]) => updateFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { ids: [contactId] } }),
    onSuccess: () => {
      toast.success("Contato removido");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      navigate({ to: "/crm" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tagMut = useMutation({
    mutationFn: (input: { tagId: string; add: boolean }) =>
      toggleTag({ data: { contactId, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact", contactId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const startMut = useMutation({
    mutationFn: () =>
      startConv({
        data: { contactId, channelId: startChannel, firstMessage: startMessage || undefined },
      }),
    onSuccess: (r) => {
      setStartOpen(false);
      navigate({ to: "/inbox/$conversationId", params: { conversationId: r.conversationId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (detail.isError || !detail.data) throw notFound();

  const { contact, tags, conversations } = detail.data;
  const currentTagIds = new Set(tags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !currentTagIds.has(t.id));
  const stage = (contact as unknown as { funnel_stage: string | null }).funnel_stage;
  const value = (contact as unknown as { deal_value_cents: number | null }).deal_value_cents;
  const score = (contact as unknown as { lead_score: number | null }).lead_score ?? 0;
  const company = (contact as unknown as { company_name: string | null }).company_name;
  const jobTitle = (contact as unknown as { job_title: string | null }).job_title;
  const origin = (contact as unknown as { origin: string | null }).origin;
  const nextAction = (contact as unknown as { next_action: string | null }).next_action;
  const stageLabel = STAGES.find((s) => s.id === (stage ?? "").toLowerCase())?.label ?? "Sem estágio";

  const digits = (contact.phone ?? "").replace(/\D/g, "");
  const wa = digits ? `https://wa.me/${digits}` : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Compact header bar */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/40 bg-background/95 px-2 py-2 backdrop-blur safe-pt">
        <Link
          to="/crm"
          className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground active:bg-accent"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{contact.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{jobTitle || company || contact.phone || contact.email || ""}</p>
        </div>
        <button
          onClick={() => setActionsOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground active:bg-accent"
          aria-label="Ações"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto momentum-scroll pb-24">
        {/* Hero */}
        <section className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/15 text-2xl font-bold text-primary ring-4 ring-primary/5">
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl font-bold">{contact.name}</h1>
              {company && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" /> {company}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <LeadScorePill score={score} />
                <span className="text-[11px] text-muted-foreground">Score {score}</span>
              </div>
            </div>
          </div>
          <LeadScoreBar score={score} />

          {/* Chips: phone/email */}
          <div className="flex flex-wrap gap-1.5">
            {contact.phone && (
              <ChipButton
                icon={<Phone className="h-3 w-3" />}
                label={contact.phone}
                onClick={() => {
                  navigator.clipboard.writeText(contact.phone!);
                  toast.success("Telefone copiado");
                }}
              />
            )}
            {contact.email && (
              <ChipButton
                icon={<Mail className="h-3 w-3" />}
                label={contact.email}
                onClick={() => {
                  navigator.clipboard.writeText(contact.email!);
                  toast.success("E-mail copiado");
                }}
              />
            )}
            {origin && (
              <Badge variant="outline" className="h-6 px-2 text-[11px]">
                {origin}
              </Badge>
            )}
          </div>

          {/* Stage + value */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setStageOpen(true)}
              className="flex flex-col items-start rounded-xl border border-border/50 bg-card p-3 text-left active:bg-accent/40"
            >
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Estágio</span>
              <span className="mt-0.5 text-sm font-semibold">{stageLabel}</span>
            </button>
            <div className="flex flex-col items-start rounded-xl border border-border/50 bg-card p-3">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Valor</span>
              <span className="mt-0.5 text-sm font-bold tabular-nums">{brl(value)}</span>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge
                key={t.id}
                variant="secondary"
                className="gap-1 border-0"
                style={{ backgroundColor: t.color + "22", color: t.color }}
              >
                {t.name}
                <button
                  onClick={() => tagMut.mutate({ tagId: t.id, add: false })}
                  className="ml-0.5 rounded-full hover:bg-black/10"
                  aria-label={`Remover ${t.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {availableTags.length > 0 && (
              <button
                onClick={() => setTagsOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Plus className="h-3 w-3" /> Tag
              </button>
            )}
          </div>

          {/* Quick action row */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            <QuickAction
              icon={<MessageSquare className="h-4 w-4" />}
              label="Conversar"
              onClick={() => setStartOpen(true)}
            />
            {wa ? (
              <QuickAction
                icon={<MessageSquare className="h-4 w-4" />}
                label="WhatsApp"
                as="a"
                href={wa}
              />
            ) : (
              <QuickAction icon={<MessageSquare className="h-4 w-4" />} label="WhatsApp" disabled />
            )}
            {contact.phone ? (
              <QuickAction
                icon={<Phone className="h-4 w-4" />}
                label="Ligar"
                as="a"
                href={`tel:${contact.phone}`}
              />
            ) : (
              <QuickAction icon={<Phone className="h-4 w-4" />} label="Ligar" disabled />
            )}
            <QuickAction
              icon={<Save className="h-4 w-4" />}
              label="Editar"
              onClick={() => setEditOpen(true)}
            />
          </div>
        </section>

        {/* Tabs */}
        <nav className="sticky top-[52px] z-[9] flex gap-1 overflow-x-auto border-b border-border/40 bg-background/95 px-3 py-2 backdrop-blur">
          {TABS.map((t) => {
            const active = tab === t.id;
            const badge = t.id === "conversations" ? conversations.length : undefined;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground",
                )}
              >
                {t.label}
                {typeof badge === "number" && badge > 0 && (
                  <span className="ml-1.5 rounded-full bg-background/30 px-1 text-[10px]">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="px-3 py-3">
          {tab === "overview" && (
            <div className="grid gap-3">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase text-primary">Próxima ação</p>
                </div>
                <p className="text-sm">{nextAction ?? "Nenhuma ação definida."}</p>
              </div>
              <MiniStat
                icon={<Clock className="h-4 w-4" />}
                label="Última interação"
                value={<ClientTime iso={contact.last_interaction_at ?? null} />}
              />
              <MiniStat
                icon={<MessageSquare className="h-4 w-4" />}
                label="Conversas"
                value={String(conversations.length)}
              />
            </div>
          )}
          {tab === "timeline" && (
            <div className="rounded-xl border border-border/40 bg-card p-3">
              <ContactTimeline contactId={contactId} />
            </div>
          )}
          {tab === "conversations" && (
            <div className="flex flex-col gap-2">
              {conversations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
                  <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Nenhuma conversa ainda</p>
                  <Button size="sm" className="mt-3" onClick={() => setStartOpen(true)}>
                    Iniciar conversa
                  </Button>
                </div>
              ) : (
                conversations.map((c) => (
                  <Link
                    key={c.id}
                    to="/inbox/$conversationId"
                    params={{ conversationId: c.id }}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-card p-3 no-underline active:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={c.status === "resolved" ? "outline" : "secondary"}
                          className="text-[10px] capitalize"
                        >
                          {c.status}
                        </Badge>
                        {c.channel?.name && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {c.channel.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {c.last_message_preview ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      <ClientTime iso={c.last_message_at} />
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
          {tab === "tasks" && <TasksTab contactId={contactId} />}
          {tab === "notes" && <NotesTab contactId={contactId} />}
          {tab === "ia" && (
            <IATab
              contactId={contactId}
              cached={
                (contact as unknown as { ai_insights: Record<string, unknown> | null })
                  .ai_insights as never
              }
            />
          )}
          {tab === "files" && <FilesTab contactId={contactId} />}
        </div>
      </div>

      {/* Actions bottom sheet */}
      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Ações</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex flex-col divide-y divide-border/40">
            <SheetAction
              icon={<MessageSquare className="h-4 w-4" />}
              label="Iniciar conversa"
              onClick={() => {
                setActionsOpen(false);
                setStartOpen(true);
              }}
            />
            <SheetAction
              icon={<Save className="h-4 w-4" />}
              label="Editar contato"
              onClick={() => {
                setActionsOpen(false);
                setEditOpen(true);
              }}
            />
            <SheetAction
              icon={<Zap className="h-4 w-4" />}
              label="Alterar estágio"
              onClick={() => {
                setActionsOpen(false);
                setStageOpen(true);
              }}
            />
            <SheetAction
              icon={<Plus className="h-4 w-4" />}
              label="Gerenciar tags"
              onClick={() => {
                setActionsOpen(false);
                setTagsOpen(true);
              }}
            />
            <SheetAction
              icon={<ListChecks className="h-4 w-4" />}
              label="Nova tarefa"
              onClick={() => {
                setActionsOpen(false);
                setTab("tasks");
              }}
            />
            <SheetAction
              icon={<StickyNote className="h-4 w-4" />}
              label="Nova nota"
              onClick={() => {
                setActionsOpen(false);
                setTab("notes");
              }}
            />
            <SheetAction
              icon={<FolderOpen className="h-4 w-4" />}
              label="Anexar arquivo"
              onClick={() => {
                setActionsOpen(false);
                setTab("files");
              }}
            />
            <SheetAction
              icon={<Trash2 className="h-4 w-4 text-destructive" />}
              label="Excluir contato"
              destructive
              onClick={() => {
                setActionsOpen(false);
                setConfirmDelete(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Stage bottom sheet */}
      <Sheet open={stageOpen} onOpenChange={setStageOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Alterar estágio</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-1">
            {STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  updateMut.mutate({ id: contactId, funnel_stage: s.id });
                  setStageOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-3 text-sm active:bg-accent",
                  (stage ?? "").toLowerCase() === s.id && "bg-primary/10 font-semibold text-primary",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Tags bottom sheet */}
      <Sheet open={tagsOpen} onOpenChange={setTagsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[70vh] overflow-y-auto rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Tags</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-1">
            {allTags.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma tag disponível.
              </p>
            )}
            {allTags.map((t) => {
              const active = currentTagIds.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => tagMut.mutate({ tagId: t.id, add: !active })}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-sm active:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </span>
                  {active && <span className="text-xs text-primary">✓</span>}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Start conversation bottom sheet */}
      <Sheet open={startOpen} onOpenChange={setStartOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Iniciar conversa</SheetTitle>
          </SheetHeader>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-1.5">
              <Label>Canal</Label>
              <Select value={startChannel} onValueChange={setStartChannel}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Selecione um canal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone_number && `· ${c.phone_number}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Primeira mensagem (opcional)</Label>
              <Textarea
                rows={3}
                value={startMessage}
                onChange={(e) => setStartMessage(e.target.value)}
                placeholder="Olá! Como posso te ajudar?"
              />
            </div>
            <Button
              className="h-12 w-full"
              onClick={() => startMut.mutate()}
              disabled={!startChannel || startMut.isPending}
            >
              {startMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abrir conversa
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Editar contato</SheetTitle>
          </SheetHeader>
          <EditContactForm
            initial={{
              name: contact.name,
              phone: contact.phone ?? "",
              email: contact.email ?? "",
              company_name: company ?? "",
              job_title: jobTitle ?? "",
              origin: origin ?? "",
              next_action: nextAction ?? "",
              deal_value_cents: value ?? 0,
              notes: contact.notes ?? "",
            }}
            saving={updateMut.isPending}
            onSave={(patch) => {
              updateMut.mutate({ id: contactId, ...patch });
              setEditOpen(false);
            }}
            onCancel={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contato será marcado como excluído. O histórico será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                delMut.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {delMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChipButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium active:bg-accent"
    >
      {icon}
      <span className="tabular-nums">{label}</span>
      <Copy className="h-3 w-3 opacity-40" />
    </button>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  as,
  href,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  as?: "a" | "button";
  href?: string;
  disabled?: boolean;
}) {
  const cls = cn(
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-border/50 bg-card px-2 py-3 text-[11px] font-medium active:bg-accent",
    disabled && "opacity-40 pointer-events-none",
  );
  if (as === "a" && href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={cls}>
        <span className="text-primary">{icon}</span>
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      <span className="text-primary">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function SheetAction({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-2 py-3.5 text-left text-sm active:bg-accent",
        destructive && "text-destructive",
      )}
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-muted/60">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function EditContactForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: {
    name: string;
    phone: string;
    email: string;
    company_name: string;
    job_title: string;
    origin: string;
    next_action: string;
    deal_value_cents: number;
    notes: string;
  };
  saving: boolean;
  onSave: (patch: {
    name: string;
    phone: string;
    email: string;
    company_name: string;
    job_title: string;
    origin: string;
    next_action: string;
    deal_value_cents: number;
    notes: string;
  }) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  return (
    <div className="flex flex-col gap-3 pt-3">
      <Field label="Nome">
        <Input
          className="h-12 text-base"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Field>
      <Field label="Telefone">
        <Input
          className="h-12 text-base"
          type="tel"
          inputMode="tel"
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
        />
      </Field>
      <Field label="E-mail">
        <Input
          className="h-12 text-base"
          type="email"
          inputMode="email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
        />
      </Field>
      <Field label="Empresa">
        <Input
          className="h-12 text-base"
          value={f.company_name}
          onChange={(e) => setF({ ...f, company_name: e.target.value })}
        />
      </Field>
      <Field label="Cargo">
        <Input
          className="h-12 text-base"
          value={f.job_title}
          onChange={(e) => setF({ ...f, job_title: e.target.value })}
        />
      </Field>
      <Field label="Origem">
        <Input
          className="h-12 text-base"
          value={f.origin}
          onChange={(e) => setF({ ...f, origin: e.target.value })}
        />
      </Field>
      <Field label="Valor (R$)">
        <Input
          className="h-12 text-base"
          type="number"
          inputMode="decimal"
          value={f.deal_value_cents / 100}
          onChange={(e) =>
            setF({ ...f, deal_value_cents: Math.round(Number(e.target.value) * 100) })
          }
        />
      </Field>
      <Field label="Próxima ação">
        <Input
          className="h-12 text-base"
          value={f.next_action}
          onChange={(e) => setF({ ...f, next_action: e.target.value })}
        />
      </Field>
      <Field label="Notas">
        <Textarea
          rows={3}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </Field>
      <SheetFooter className="mt-2 flex-row gap-2">
        <Button variant="outline" className="h-12 flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button className="h-12 flex-1" onClick={() => onSave(f)} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </SheetFooter>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
