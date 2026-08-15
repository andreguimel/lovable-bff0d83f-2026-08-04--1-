import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRightLeft,
  X,
  Plus,
  Sparkles,
  Mail,
  Phone,
  Building2,
  UserCog,
  Bot,
  User as UserIcon,
  MessageSquare,
  Radio,
  Pencil,
  MoreVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { updateContact, listTags, toggleContactTag } from "@/lib/inbox.functions";
import { listCustomFields, setCustomFieldValue } from "@/lib/crm.functions";
import { BotPauseButton } from "@/components/inbox/bot-pause-button";
import { CallButton } from "@/components/inbox/call-button";
import { FlowAgentPickerPopover } from "@/components/inbox/flow-agent-picker-dialog";
import { EmailAiDialog } from "./email-ai-dialog";
import { TransferDialog } from "./transfer-dialog";
import { ContactTimeline } from "@/components/crm/contact-timeline";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  avatar_url: string | null;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Props {
  contact: Contact;
  tags: Tag[];
  channelName?: string;
  conversationId: string;
  assigneeLabel?: string;
  assigneeType?: "unassigned" | "agent_user" | "ai_agent";
  status?: "open" | "pending" | "resolved";
}

export function ContactPanel({
  contact,
  tags,
  channelName,
  conversationId,
  assigneeLabel = "Não atribuída",
  assigneeType = "unassigned",
  status = "open",
}: Props) {
  const qc = useQueryClient();
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"flows" | "agents">("flows");
  const [tab, setTab] = useState<"overview" | "history">("overview");

  useEffect(() => {
    const onOpen = () => setTransferOpen(true);
    window.addEventListener("inbox:open-transfer", onOpen);
    return () => window.removeEventListener("inbox:open-transfer", onOpen);
  }, []);

  useEffect(() => {
    const onOpenPicker = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: "flows" | "agents" }>).detail;
      setPickerTab(detail?.tab === "agents" ? "agents" : "flows");
      setPickerOpen(true);
    };
    window.addEventListener("inbox:open-flow-agent", onOpenPicker as EventListener);
    return () =>
      window.removeEventListener("inbox:open-flow-agent", onOpenPicker as EventListener);
  }, []);

  const upd = useServerFn(updateContact);
  const listAllTags = useServerFn(listTags);
  const toggleTag = useServerFn(toggleContactTag);

  const { data: allTags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => listAllTags() });

  const tagMut = useMutation({
    mutationFn: (input: { tagId: string; add: boolean }) =>
      toggleTag({ data: { contactId: contact.id, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const currentTagIds = new Set(tags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !currentTagIds.has(t.id));

  return (
    <>
      <aside className="hidden h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-border/50 bg-sidebar/30 lg:flex xl:w-[360px]">
        {/* Sticky identity header */}
        <div className="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-lg font-semibold text-primary-foreground shadow-sm ring-1 ring-border/50">
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground">{contact.name}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {contact.phone ?? "sem telefone"}
              </p>
              <div className="mt-1.5 flex items-center gap-1">
                <StatusDot status={status} />
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {status === "open" ? "Aberta" : status === "pending" ? "Pendente" : "Resolvida"}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <CallButton conversationId={conversationId} phone={contact.phone} contactName={contact.name} />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                aria-label="Editar contato"
                title="Editar contato"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <FlowAgentPickerPopover
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                tab={pickerTab}
                onTabChange={setPickerTab}
                conversationId={conversationId}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    aria-label="Mais ações do contato"
                    title="Mais ações"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </div>
          </div>



          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Automação
            </span>
            <BotPauseButton conversationId={conversationId} />
          </div>


          <Tabs value={tab} onValueChange={(v) => setTab(v as "overview" | "history")} className="mt-4">
            <TabsList className="grid h-9 w-full grid-cols-2 rounded-full bg-muted/60 p-1">
              <TabsTrigger value="overview" className="rounded-full text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-full text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Histórico
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Tabs value={tab} className="h-full">
            <TabsContent value="overview" className="mt-0 space-y-3 p-4">
              {/* Contact info */}
              <Section title="Contato" defaultOpen>
                <InfoRow icon={Phone} label="Telefone" value={contact.phone ?? "—"} />
                <InfoRow icon={Mail} label="Email" value={contact.email ?? "—"} />
                {channelName && <InfoRow icon={Radio} label="Canal" value={channelName} />}
              </Section>

              {/* Assignment / IA */}
              <Section title="Atendimento" defaultOpen>
                <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 p-2.5">
                  <div
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-full",
                      assigneeType === "ai_agent"
                        ? "bg-primary/15 text-primary"
                        : assigneeType === "agent_user"
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {assigneeType === "ai_agent" ? (
                      <Bot className="h-4 w-4" />
                    ) : assigneeType === "agent_user" ? (
                      <UserIcon className="h-4 w-4" />
                    ) : (
                      <UserCog className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {assigneeType === "ai_agent" ? "Agente IA" : assigneeType === "agent_user" ? "Atendente" : "Sem responsável"}
                    </p>
                    <p className="truncate text-[13px] font-semibold text-foreground">{assigneeLabel}</p>
                  </div>
                </div>
              </Section>

              {/* Tags */}
              <Section title="Etiquetas" defaultOpen>
                <div className="flex flex-wrap gap-1.5">
                  {tags.length === 0 && availableTags.length === 0 && (
                    <p className="text-[12px] text-muted-foreground">Sem etiquetas.</p>
                  )}
                  {tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${t.color} 14%, transparent)`,
                        color: t.color,
                        border: `1px solid color-mix(in oklab, ${t.color} 35%, transparent)`,
                      }}
                    >
                      {t.name}
                      <button
                        onClick={() => tagMut.mutate({ tagId: t.id, add: false })}
                        className="rounded-full opacity-70 hover:opacity-100"
                        aria-label={`Remover ${t.name}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  {availableTags.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-primary">
                          <Plus className="h-3 w-3" /> Etiqueta
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {availableTags.map((t) => (
                          <DropdownMenuItem key={t.id} onClick={() => tagMut.mutate({ tagId: t.id, add: true })}>
                            <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Section>

              {/* Notes preview */}
              <Section title="Notas internas" defaultOpen>
                {contact.notes ? (
                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/85">
                    {contact.notes}
                  </p>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    Nenhuma anotação. Registre observações importantes sobre este contato.
                  </p>
                )}
                <Button variant="ghost" size="sm" className="mt-2 h-8 w-full justify-start px-2 text-xs" onClick={() => setNotesOpen(true)}>
                  <Pencil className="mr-2 h-3 w-3" /> Editar notas
                </Button>
              </Section>

              {/* Actions */}
              <div className="grid gap-2 pt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block">
                      <Button
                        variant="outline"
                        onClick={() => setEmailDialogOpen(true)}
                        disabled={!contact.email}
                        className="h-9 w-full justify-start gap-2 text-[13px]"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Compor e-mail com IA
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!contact.email && <TooltipContent>Adicione um e-mail ao contato para habilitar</TooltipContent>}
                </Tooltip>
                <Button
                  variant="outline"
                  onClick={() => setTransferOpen(true)}
                  className="h-9 w-full justify-start gap-2 text-[13px]"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Transferir para outro número
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-0 p-4">
              <ContactTimeline contactId={contact.id} />
            </TabsContent>
          </Tabs>
        </div>
      </aside>

      <EditContactSheet contact={contact} open={editOpen} onOpenChange={setEditOpen} companyName={undefined} />
      <NotesSheet contact={contact} open={notesOpen} onOpenChange={setNotesOpen} />

      {contact.email && (
        <EmailAiDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          conversationId={conversationId}
          contactEmail={contact.email}
          contactName={contact.name}
        />
      )}
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        conversationId={conversationId}
        currentChannelName={channelName}
      />
    </>
  );
}

// ---------- helpers ----------

function StatusDot({ status }: { status: "open" | "pending" | "resolved" }) {
  const color =
    status === "open"
      ? "bg-success"
      : status === "pending"
        ? "bg-warning"
        : "bg-muted-foreground";
  return <span className={cn("h-1.5 w-1.5 rounded-full", color)} />;
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-[13px] font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="mt-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function EditContactSheet({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyName?: string;
}) {
  const qc = useQueryClient();
  const upd = useServerFn(updateContact);
  const listCFFn = useServerFn(listCustomFields);
  const setCFValueFn = useServerFn(setCustomFieldValue);

  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const { data: fields = [] } = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => listCFFn(),
    enabled: open,
  });

  useEffect(() => {
    setName(contact.name);
    setEmail(contact.email ?? "");
  }, [contact.id, contact.name, contact.email]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await upd({ data: { id: contact.id, name, email: email || null } });
      for (const [fieldId, val] of Object.entries(customValues)) {
        await setCFValueFn({ data: { contactId: contact.id, fieldId, value: val || null } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation"] });
      qc.invalidateQueries({ queryKey: ["contact", contact.id] });
      toast.success("Contato atualizado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar contato</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex-1 space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Nome</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {fields.length > 0 && (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Campos customizados
              </p>
              {fields.map((field) => (
                <div key={field.id} className="grid gap-1.5">
                  <Label htmlFor={`inbox-cf-${field.id}`} className="text-xs font-medium text-muted-foreground">
                    {field.label}
                  </Label>
                  {field.field_type === "select" && Array.isArray(field.options) ? (
                    <Select
                      value={customValues[field.id] ?? ""}
                      onValueChange={(v) => setCustomValues((prev) => ({ ...prev, [field.id]: v }))}
                    >
                      <SelectTrigger id={`inbox-cf-${field.id}`}>
                        <SelectValue placeholder="— Selecione —" />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options as string[]).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`inbox-cf-${field.id}`}
                      type={
                        field.field_type === "number"
                          ? "number"
                          : field.field_type === "date"
                            ? "date"
                            : "text"
                      }
                      value={customValues[field.id] ?? ""}
                      onChange={(e) =>
                        setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NotesSheet({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const upd = useServerFn(updateContact);
  const [notes, setNotes] = useState(contact.notes ?? "");

  useEffect(() => {
    setNotes(contact.notes ?? "");
  }, [contact.id, contact.notes]);

  const saveMut = useMutation({
    mutationFn: () => upd({ data: { id: contact.id, notes: notes || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation"] });
      toast.success("Notas atualizadas");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notas internas</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={12}
            placeholder="Registre observações importantes sobre este contato…"
          />
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Unused re-exports kept for compatibility
export type { Contact as _ContactType };
export const _MessageIcon = MessageSquare;
export const _BuildingIcon = Building2;
