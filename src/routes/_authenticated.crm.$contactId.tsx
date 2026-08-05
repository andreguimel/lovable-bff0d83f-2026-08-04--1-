import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  MessageSquare,
  Loader2,
  Trash2,
  Phone,
  Mail,
  X,
  Plus,
  Zap,
  Building2,
  Sparkles,
  Clock,
  ListChecks,
  StickyNote,
  FolderOpen,
  GitBranch,
  Bot,
  Megaphone,
  LayoutDashboard,
  Calendar,
  Save,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { listCascadePolicies, startCascadeRun } from "@/lib/cascade.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientTime } from "@/components/client-time";
import {
  getContact,
  updateContact,
  deleteContacts,
  toggleContactTag,
  listChannels,
  startConversationFromContact,
} from "@/lib/crm.functions";
import { listTags } from "@/lib/inbox.functions";
import { ContactTimeline } from "@/components/crm/contact-timeline";
import { LeadScorePill, LeadScoreBar } from "@/components/crm/lead-score";
import { STAGES } from "@/components/crm/views/kanban-view";
import { AIFab } from "@/components/crm/profile/ai-fab";
import { TasksTab } from "@/components/crm/profile/tabs/tasks-tab";
import { NotesTab } from "@/components/crm/profile/tabs/notes-tab";
import { IATab } from "@/components/crm/profile/tabs/ia-tab";
import { FilesTab } from "@/components/crm/profile/tabs/files-tab";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileContactProfile } from "@/components/crm/mobile/mobile-contact-profile";

export const Route = createFileRoute("/_authenticated/crm/$contactId")({
  head: () => ({ meta: [{ title: "Contato — CRM" }] }),
  component: ContactRoute,
  notFoundComponent: () => (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Contato não encontrado.</p>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-sm text-destructive">{error.message}</p>
    </div>
  ),
});

function ContactRoute() {
  const isMobile = useIsMobile();
  const { contactId } = Route.useParams();
  return isMobile ? <MobileContactProfile contactId={contactId} /> : <ContactPage />;
}

type TabId =
  | "overview"
  | "conversations"
  | "timeline"
  | "ia"
  | "flows"
  | "agents"
  | "campaigns"
  | "files"
  | "tasks"
  | "notes"
  | "calendar";

const TABS: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "conversations", label: "Conversas", icon: MessageSquare },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "ia", label: "IA", icon: Sparkles },
  { id: "flows", label: "Fluxos", icon: GitBranch },
  { id: "agents", label: "Agentes IA", icon: Bot },
  { id: "campaigns", label: "Campanhas", icon: Megaphone },
  { id: "files", label: "Arquivos", icon: FolderOpen },
  { id: "tasks", label: "Tarefas", icon: ListChecks },
  { id: "notes", label: "Anotações", icon: StickyNote },
  { id: "calendar", label: "Agenda", icon: Calendar },
];

const brl = (cents: number | null) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

function ContactPage() {
  const { contactId } = Route.useParams();
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openStart, setOpenStart] = useState(false);
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
      setOpenStart(false);
      navigate({ to: "/inbox/$conversationId", params: { conversationId: r.conversationId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
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
  const aiInsights =
    (contact as unknown as { ai_insights: Record<string, unknown> | null }).ai_insights ?? null;

  return (
    <div className="relative flex flex-col gap-5 p-4 md:p-6">
      <Link
        to="/crm"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao CRM
      </Link>

      {/* HEADER */}
      <div className="profile-header">
        <div className="flex flex-wrap items-start gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/15 text-2xl font-bold text-primary ring-4 ring-primary/5">
            {contact.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-display text-2xl font-bold tracking-tight">{contact.name}</h1>
              {jobTitle && <span className="text-sm text-muted-foreground">{jobTitle}</span>}
              {company && (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> {company}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {contact.phone && (
                <ContactChip
                  icon={<Phone className="h-3 w-3" />}
                  label={contact.phone}
                  onClick={() => {
                    navigator.clipboard.writeText(contact.phone!);
                    toast.success("Telefone copiado");
                  }}
                />
              )}
              {contact.email && (
                <ContactChip
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
                  Origem: {origin}
                </Badge>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {availableTags.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-6 gap-1 text-xs">
                      <Plus className="h-3 w-3" /> Tag
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {availableTags.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => tagMut.mutate({ tagId: t.id, add: true })}
                      >
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        {t.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Score + Stage + Value block */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/60 p-3 backdrop-blur">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Lead score
              </p>
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-bold tabular-nums">{score}</span>
                <LeadScorePill score={score} />
              </div>
              <div className="mt-1.5 w-40">
                <LeadScoreBar score={score} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Valor</p>
                <p className="text-sm font-bold tabular-nums">{brl(value)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Estágio</p>
                <Select
                  value={stage ?? "novo"}
                  onValueChange={(v) => updateMut.mutate({ id: contactId, funnel_stage: v })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
          <div className="qa-bar">
            <button className="qa-btn" onClick={() => setOpenStart(true)}>
              <MessageSquare className="h-3.5 w-3.5" /> Conversar
            </button>
            <button className="qa-btn" onClick={() => setEditOpen(true)}>
              <Save className="h-3.5 w-3.5" /> Editar dados
            </button>
            <button className="qa-btn" onClick={() => setTab("tasks")}>
              <ListChecks className="h-3.5 w-3.5" /> Tarefa
            </button>
            <button className="qa-btn" onClick={() => setTab("notes")}>
              <StickyNote className="h-3.5 w-3.5" /> Nota
            </button>
            <button className="qa-btn" onClick={() => setTab("files")}>
              <FolderOpen className="h-3.5 w-3.5" /> Arquivo
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StartCascadeButton contactId={contactId} />
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" /> Excluir
            </Button>
          </div>
        </div>
      </div>

      {/* MAIN GRID: tabs sidebar + content */}
      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Tabs */}
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const badge =
              t.id === "conversations" ? conversations.length : undefined;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn("profile-tab shrink-0", active && "profile-tab-active")}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
                {typeof badge === "number" && badge > 0 && (
                  <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="min-w-0">
          {tab === "overview" && (
            <OverviewTab
              nextAction={nextAction}
              lastInteractionAt={contact.last_interaction_at ?? null}
              conversationsCount={conversations.length}
              aiSummary={
                aiInsights && typeof (aiInsights as { summary?: unknown }).summary === "string"
                  ? String((aiInsights as { summary: string }).summary)
                  : null
              }
              onGoIA={() => setTab("ia")}
            />
          )}
          {tab === "conversations" && (
            <ConversationsTab conversations={conversations} onStart={() => setOpenStart(true)} />
          )}
          {tab === "timeline" && (
            <div className="rounded-xl border border-border/40 bg-card p-4">
              <ContactTimeline contactId={contactId} />
            </div>
          )}
          {tab === "ia" && (
            <IATab contactId={contactId} cached={aiInsights as never} />
          )}
          {tab === "tasks" && <TasksTab contactId={contactId} />}
          {tab === "notes" && <NotesTab contactId={contactId} />}
          {tab === "files" && <FilesTab contactId={contactId} />}
          {tab === "flows" && (
            <PlaceholderPanel
              icon={<GitBranch className="h-5 w-5 text-primary" />}
              title="Fluxos deste contato"
              description="Em breve: gerencie fluxos ativos e concluídos, inicie novos e mova o cliente entre etapas."
              link={{ to: "/flows", label: "Ir para Fluxos" }}
            />
          )}
          {tab === "agents" && (
            <PlaceholderPanel
              icon={<Bot className="h-5 w-5 text-primary" />}
              title="Agentes IA responsáveis"
              description="Em breve: veja qual agente está atendendo este cliente e alterne entre agentes por contexto."
              link={{ to: "/agents", label: "Ir para Agentes IA" }}
            />
          )}
          {tab === "campaigns" && (
            <PlaceholderPanel
              icon={<Megaphone className="h-5 w-5 text-primary" />}
              title="Campanhas recebidas"
              description="Em breve: acompanhe envios, aberturas e cliques deste contato em campanhas."
              link={{ to: "/campaigns", label: "Ir para Campanhas" }}
            />
          )}
          {tab === "calendar" && (
            <PlaceholderPanel
              icon={<Calendar className="h-5 w-5 text-primary" />}
              title="Agenda do cliente"
              description="Em breve: reuniões, ligações e follow-ups integrados a Google Calendar e Outlook."
            />
          )}
        </div>
      </div>

      <AIFab contactId={contactId} />

      {/* Edit sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-lg">
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
            onSave={(patch) => {
              updateMut.mutate({ id: contactId, ...patch });
              setEditOpen(false);
            }}
            saving={updateMut.isPending}
          />
        </SheetContent>
      </Sheet>

      {/* Start conversation dialog */}
      <Dialog open={openStart} onOpenChange={setOpenStart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar conversa</DialogTitle>
            <DialogDescription>Escolha o canal para conversar com {contact.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Canal</Label>
              <Select value={startChannel} onValueChange={setStartChannel}>
                <SelectTrigger>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenStart(false)}>
              Cancelar
            </Button>
            <Button onClick={() => startMut.mutate()} disabled={!startChannel || startMut.isPending}>
              {startMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abrir conversa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function ContactChip({
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
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-accent"
    >
      {icon}
      <span className="tabular-nums">{label}</span>
      <Copy className="h-3 w-3 opacity-40" />
    </button>
  );
}

function OverviewTab({
  nextAction,
  lastInteractionAt,
  conversationsCount,
  aiSummary,
  onGoIA,
}: {
  nextAction: string | null;
  lastInteractionAt: string | null;
  conversationsCount: number;
  aiSummary: string | null;
  onGoIA: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 md:col-span-2">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Resumo IA</p>
          <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={onGoIA}>
            {aiSummary ? "Ver mais insights →" : "Gerar insights →"}
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          {aiSummary ?? "Ainda sem análise. Abra a aba IA para gerar um resumo automático deste cliente."}
        </p>
      </div>

      <MiniStat
        label="Última interação"
        value={<ClientTime iso={lastInteractionAt} />}
        icon={<Clock className="h-4 w-4" />}
      />
      <MiniStat
        label="Conversas"
        value={String(conversationsCount)}
        icon={<MessageSquare className="h-4 w-4" />}
      />
      <MiniStat
        label="Próxima ação"
        value={nextAction ?? "Não definida"}
        icon={<Zap className="h-4 w-4" />}
        span
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
  span,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  span?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border/40 bg-card p-4", span && "md:col-span-2")}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function ConversationsTab({
  conversations,
  onStart,
}: {
  conversations: Array<{
    id: string;
    status: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    channel: { id: string; name: string } | null;
  }>;
  onStart: () => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
        <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Nenhuma conversa ainda</p>
        <Button size="sm" className="mt-3" onClick={onStart}>
          Iniciar conversa
        </Button>
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40 bg-card">
      {conversations.map((c) => (
        <Link
          key={c.id}
          to="/inbox/$conversationId"
          params={{ conversationId: c.id }}
          className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40"
        >
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm">
              <Badge variant={c.status === "resolved" ? "outline" : "secondary"} className="text-xs capitalize">
                {c.status}
              </Badge>
              {c.channel?.name && <span className="text-xs text-muted-foreground">{c.channel.name}</span>}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{c.last_message_preview ?? "—"}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            <ClientTime iso={c.last_message_at} />
          </span>
        </Link>
      ))}
    </div>
  );
}

function PlaceholderPanel({
  icon,
  title,
  description,
  link,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">{icon}</div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {link && (
        <Link to={link.to as never} className="mt-4 inline-flex text-xs font-semibold text-primary hover:underline">
          {link.label} →
        </Link>
      )}
    </div>
  );
}

function EditContactForm({
  initial,
  onSave,
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
  saving: boolean;
}) {
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
      <Field label="Nome">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefone">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Empresa">
          <Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} />
        </Field>
        <Field label="Cargo">
          <Input value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Origem">
          <Input
            value={f.origin}
            onChange={(e) => setF({ ...f, origin: e.target.value })}
            placeholder="ex.: Instagram"
          />
        </Field>
        <Field label="Valor (R$)">
          <Input
            type="number"
            value={f.deal_value_cents / 100}
            onChange={(e) => setF({ ...f, deal_value_cents: Math.round(Number(e.target.value) * 100) })}
          />
        </Field>
      </div>
      <Field label="Próxima ação">
        <Input value={f.next_action} onChange={(e) => setF({ ...f, next_action: e.target.value })} />
      </Field>
      <Field label="Notas">
        <Textarea rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      <div className="mt-auto flex justify-end pt-2">
        <Button onClick={() => onSave(f)} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
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

function StartCascadeButton({ contactId }: { contactId: string }) {
  const listFn = useServerFn(listCascadePolicies);
  const startFn = useServerFn(startCascadeRun);
  const { data: policies = [] } = useQuery({
    queryKey: ["cascade-policies"],
    queryFn: () => listFn(),
  });
  const startMut = useMutation({
    mutationFn: (policyId: string) => startFn({ data: { policyId, contactId } }),
    onSuccess: () => toast.success("Cascata iniciada"),
    onError: (e: Error) => toast.error(e.message),
  });
  const active = policies.filter((p) => p.active);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={active.length === 0}>
          <Zap className="mr-1.5 h-3.5 w-3.5 text-primary" /> Cascata
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {active.length === 0 ? (
          <DropdownMenuItem disabled>Nenhuma cascata ativa</DropdownMenuItem>
        ) : (
          active.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => startMut.mutate(p.id)}>
              {p.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
