import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Loader2, Plus, Search, Settings2, Trash2, GripVertical, ArchiveRestore, User, MoreVertical, History } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import {
  listFunnels, createFunnel, updateFunnel, archiveFunnel,
  listStages, createStage, updateStage, archiveStage,
  listCards, createCard, moveCard, updateCard, archiveCard, listCardEvents,
  listAvailableContacts, listCompanyMembers,
} from "@/lib/funnel.functions";

export const Route = createFileRoute("/_authenticated/funnels")({
  head: () => ({
    meta: [
      { title: "Funis — Zenda" },
      { name: "description", content: "Kanban de oportunidades comerciais com múltiplos funis, etapas customizáveis e histórico canônico por contato." },
      { property: "og:title", content: "Funis — Zenda" },
      { property: "og:description", content: "Kanban de oportunidades comerciais com múltiplos funis, etapas customizáveis e histórico canônico por contato." },
    ],
  }),
  component: FunnelsPage,
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function initials(s?: string | null) {
  const t = (s ?? "?").trim(); if (!t) return "?";
  return t.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function FunnelsPage() {
  const qc = useQueryClient();
  const _listFunnels = useServerFn(listFunnels);
  const _listStages = useServerFn(listStages);
  const _listCards = useServerFn(listCards);
  const _createFunnel = useServerFn(createFunnel);
  const _updateFunnel = useServerFn(updateFunnel);
  const _archiveFunnel = useServerFn(archiveFunnel);
  const _createStage = useServerFn(createStage);
  const _updateStage = useServerFn(updateStage);
  const _archiveStage = useServerFn(archiveStage);
  const _moveCard = useServerFn(moveCard);
  const _createCard = useServerFn(createCard);
  const _archiveCard = useServerFn(archiveCard);
  const _updateCard = useServerFn(updateCard);
  const _listMembers = useServerFn(listCompanyMembers);

  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState<string | null>(null);

  const [showFunnelDialog, setShowFunnelDialog] = useState<false | { mode: "create" } | { mode: "edit"; id: string; name: string; description: string; color: string }>(false);
  const [showStageDialog, setShowStageDialog] = useState<false | { mode: "create" } | { mode: "edit"; id: string; name: string; color: string; kind: "open" | "won" | "lost" }>(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const funnelsQ = useQuery({
    queryKey: ["funnels"], queryFn: () => _listFunnels(),
  });
  const funnels = funnelsQ.data ?? [];

  useEffect(() => {
    if (!selectedFunnelId && funnels.length > 0) setSelectedFunnelId(funnels[0].id);
    if (selectedFunnelId && !funnels.find((f: any) => f.id === selectedFunnelId)) {
      setSelectedFunnelId(funnels[0]?.id ?? null);
    }
  }, [funnels, selectedFunnelId]);

  const stagesQ = useQuery({
    queryKey: ["funnel-stages", selectedFunnelId],
    queryFn: () => _listStages({ data: { funnelId: selectedFunnelId! } }),
    enabled: !!selectedFunnelId,
  });
  const stages = stagesQ.data ?? [];

  const cardsQ = useQuery({
    queryKey: ["funnel-cards", selectedFunnelId, search, assignedFilter],
    queryFn: () => _listCards({ data: { funnelId: selectedFunnelId!, search, assignedTo: assignedFilter } }),
    enabled: !!selectedFunnelId,
  });
  const cards = cardsQ.data ?? [];

  const membersQ = useQuery({ queryKey: ["company-members"], queryFn: () => _listMembers() });
  const members = membersQ.data ?? [];

  const memberById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of members) m.set(p.id, p);
    return m;
  }, [members]);

  const invalidateBoard = () => {
    qc.invalidateQueries({ queryKey: ["funnels"] });
    qc.invalidateQueries({ queryKey: ["funnel-stages", selectedFunnelId] });
    qc.invalidateQueries({ queryKey: ["funnel-cards", selectedFunnelId] });
  };

  const moveMutation = useMutation({
    mutationFn: (v: { id: string; toStageId: string }) => _moveCard({ data: v }),
    onMutate: async (v) => {
      const key = ["funnel-cards", selectedFunnelId, search, assignedFilter];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<any[]>(key) ?? [];
      qc.setQueryData<any[]>(key, prev.map((c) => c.id === v.id ? { ...c, stage_id: v.toStageId } : c));
      return { prev, key };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev && ctx?.key) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message ?? "Falha ao mover card.");
    },
    onSettled: () => invalidateBoard(),
  });

  const createFunnelMut = useMutation({
    mutationFn: (v: { name: string; description?: string; color?: string }) => _createFunnel({ data: v }),
    onSuccess: (row: any) => {
      toast.success(`Funil "${row.name}" criado.`);
      setSelectedFunnelId(row.id);
      setShowFunnelDialog(false);
      qc.invalidateQueries({ queryKey: ["funnels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateFunnelMut = useMutation({
    mutationFn: (v: { id: string; name?: string; description?: string; color?: string }) => _updateFunnel({ data: v }),
    onSuccess: () => { toast.success("Funil atualizado."); setShowFunnelDialog(false); qc.invalidateQueries({ queryKey: ["funnels"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const archiveFunnelMut = useMutation({
    mutationFn: (id: string) => _archiveFunnel({ data: { id } }),
    onSuccess: () => { toast.success("Funil arquivado."); qc.invalidateQueries({ queryKey: ["funnels"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createStageMut = useMutation({
    mutationFn: (v: { name: string; color?: string; kind?: "open" | "won" | "lost" }) =>
      _createStage({ data: { funnelId: selectedFunnelId!, ...v } }),
    onSuccess: () => { toast.success("Etapa criada."); setShowStageDialog(false); qc.invalidateQueries({ queryKey: ["funnel-stages", selectedFunnelId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateStageMut = useMutation({
    mutationFn: (v: { id: string; name?: string; color?: string; kind?: "open" | "won" | "lost" }) => _updateStage({ data: v }),
    onSuccess: () => { toast.success("Etapa atualizada."); setShowStageDialog(false); qc.invalidateQueries({ queryKey: ["funnel-stages", selectedFunnelId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const archiveStageMut = useMutation({
    mutationFn: (id: string) => _archiveStage({ data: { id } }),
    onSuccess: () => { toast.success("Etapa arquivada."); invalidateBoard(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCardMut = useMutation({
    mutationFn: (v: { contactId: string; valueCents?: number; assignedUserId?: string | null; title?: string | null }) =>
      _createCard({ data: { funnelId: selectedFunnelId!, ...v } }),
    onSuccess: () => { toast.success("Card adicionado ao funil."); setShowAddCard(false); invalidateBoard(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateCardMut = useMutation({
    mutationFn: (v: any) => _updateCard({ data: v }),
    onSuccess: () => { toast.success("Card atualizado."); invalidateBoard(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const archiveCardMut = useMutation({
    mutationFn: (id: string) => _archiveCard({ data: { id } }),
    onSuccess: () => { toast.success("Card arquivado."); setOpenCardId(null); invalidateBoard(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd(e: DragEndEvent) {
    const cardId = e.active.id as string;
    const stageId = e.over?.id as string | undefined;
    if (!stageId) return;
    const c = cards.find((x: any) => x.id === cardId);
    if (!c || c.stage_id === stageId) return;
    moveMutation.mutate({ id: cardId, toStageId: stageId });
  }

  const selectedFunnel = funnels.find((f: any) => f.id === selectedFunnelId);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6 gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">Funil de vendas</h1>
            <p className="text-xs text-muted-foreground">Cards representam a mesma identidade canônica do CRM.</p>
          </div>
          {funnels.length > 0 && (
            <Select value={selectedFunnelId ?? undefined} onValueChange={(v) => setSelectedFunnelId(v)}>
              <SelectTrigger className="min-w-[220px]">
                <SelectValue placeholder="Selecionar funil" />
              </SelectTrigger>
              <SelectContent>
                {funnels.map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: f.color ?? "#3B82F6" }} />
                      {f.name}
                      {f.is_default && <Badge variant="secondary" className="h-4 px-1 text-[9px]">padrão</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedFunnel && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar contato..." className="pl-8 h-9 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={assignedFilter ?? "all"} onValueChange={(v) => setAssignedFilter(v === "all" ? null : v)}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos responsáveis</SelectItem>
                  {members.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => setShowStageDialog({ mode: "create" })}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Etapa
              </Button>
              <Button size="sm" onClick={() => setShowAddCard(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar card
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost"><Settings2 className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setShowFunnelDialog({ mode: "edit", id: selectedFunnel.id, name: selectedFunnel.name, description: selectedFunnel.description ?? "", color: selectedFunnel.color ?? "#3B82F6" })}>
                    Editar funil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowFunnelDialog({ mode: "create" })}>
                    Novo funil
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => { if (confirm(`Arquivar o funil "${selectedFunnel.name}"?`)) archiveFunnelMut.mutate(selectedFunnel.id); }}
                  >
                    Arquivar funil
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {funnels.length === 0 && !funnelsQ.isPending && (
            <Button size="sm" onClick={() => setShowFunnelDialog({ mode: "create" })}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar primeiro funil
            </Button>
          )}
        </div>
      </div>

      {/* Board */}
      {funnelsQ.isPending || stagesQ.isPending || cardsQ.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !selectedFunnel ? (
        <EmptyBoard onCreate={() => setShowFunnelDialog({ mode: "create" })} />
      ) : stages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground gap-3">
          <p className="text-sm">Este funil ainda não tem etapas.</p>
          <Button size="sm" onClick={() => setShowStageDialog({ mode: "create" })}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar primeira etapa
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3">
            {stages.map((s: any) => {
              const list = cards.filter((c: any) => c.stage_id === s.id);
              const total = list.reduce((a: number, c: any) => a + (c.value_cents ?? 0), 0);
              return (
                <StageColumn
                  key={s.id} stage={s} count={list.length} total={total}
                  onEditStage={() => setShowStageDialog({ mode: "edit", id: s.id, name: s.name, color: s.color, kind: s.kind })}
                  onArchiveStage={() => { if (confirm(`Arquivar etapa "${s.name}"?`)) archiveStageMut.mutate(s.id); }}
                >
                  {list.map((c: any) => (
                    <CardTile key={c.id} card={c} assignee={memberById.get(c.assigned_user_id)} onOpen={() => setOpenCardId(c.id)} />
                  ))}
                  {list.length === 0 && (
                    <p className="p-4 text-center text-[11px] text-muted-foreground italic">Sem cards</p>
                  )}
                </StageColumn>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* Dialogs / Sheets */}
      {showFunnelDialog && (
        <FunnelDialog
          initial={showFunnelDialog.mode === "edit" ? showFunnelDialog : undefined}
          onClose={() => setShowFunnelDialog(false)}
          onSubmit={(v) => showFunnelDialog.mode === "edit"
            ? updateFunnelMut.mutate({ id: showFunnelDialog.id, ...v })
            : createFunnelMut.mutate(v)}
          pending={createFunnelMut.isPending || updateFunnelMut.isPending}
        />
      )}

      {showStageDialog && selectedFunnelId && (
        <StageDialog
          initial={showStageDialog.mode === "edit" ? showStageDialog : undefined}
          onClose={() => setShowStageDialog(false)}
          onSubmit={(v) => showStageDialog.mode === "edit"
            ? updateStageMut.mutate({ id: showStageDialog.id, ...v })
            : createStageMut.mutate(v)}
          pending={createStageMut.isPending || updateStageMut.isPending}
        />
      )}

      {showAddCard && selectedFunnelId && (
        <AddCardDialog
          funnelId={selectedFunnelId}
          members={members}
          onClose={() => setShowAddCard(false)}
          onSubmit={(v) => createCardMut.mutate(v)}
          pending={createCardMut.isPending}
        />
      )}

      {openCardId && (
        <CardDrawer
          cardId={openCardId}
          card={cards.find((c: any) => c.id === openCardId)}
          members={members}
          stages={stages}
          onClose={() => setOpenCardId(null)}
          onSave={(patch) => updateCardMut.mutate({ id: openCardId, ...patch })}
          onArchive={() => { if (confirm("Arquivar este card?")) archiveCardMut.mutate(openCardId); }}
          onMove={(stageId) => moveMutation.mutate({ id: openCardId, toStageId: stageId })}
        />
      )}
    </div>
  );
}

// ============================================================================
// Column
// ============================================================================
function StageColumn({
  stage, count, total, children, onEditStage, onArchiveStage,
}: {
  stage: any; count: number; total: number; children: React.ReactNode;
  onEditStage: () => void; onArchiveStage: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const isWon = stage.kind === "won";
  const isLost = stage.kind === "lost";
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border border-border/60 bg-card/40 transition-colors ${
        isOver ? "border-primary/60 bg-primary/5" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold truncate">{stage.name}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{count}</Badge>
          {isWon && <Badge className="h-5 px-1.5 text-[9px] bg-emerald-500/15 text-emerald-600 border-0">GANHO</Badge>}
          {isLost && <Badge className="h-5 px-1.5 text-[9px] bg-rose-500/15 text-rose-600 border-0">PERDA</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">{formatBRL(total)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6"><MoreVertical className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEditStage}>Editar etapa</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={onArchiveStage}>Arquivar etapa</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 min-h-[120px]">{children}</div>
    </div>
  );
}

// ============================================================================
// Card tile
// ============================================================================
function CardTile({ card, assignee, onOpen }: { card: any; assignee?: any; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const contact = card.contact;
  return (
    <div
      ref={setNodeRef} style={style} {...listeners} {...attributes}
      onDoubleClick={onOpen}
      className={`cursor-grab rounded-xl border border-border/60 bg-background p-3 shadow-sm active:cursor-grabbing hover:border-primary/40 transition-colors ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={contact?.avatar_url ?? undefined} />
          <AvatarFallback className="text-[10px]">{initials(contact?.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{contact?.name ?? "Contato"}</p>
          {contact?.phone && (
            <p className="truncate text-[11px] text-muted-foreground">{contact.phone}</p>
          )}
          {card.title && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{card.title}</p>}
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={onOpen}>
          <GripVertical className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {card.value_cents > 0 ? (
          <p className="text-xs font-semibold text-primary">{formatBRL(card.value_cents)}</p>
        ) : <span />}
        {assignee ? (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Avatar className="h-4 w-4"><AvatarFallback className="text-[7px]">{initials(assignee.full_name || assignee.email)}</AvatarFallback></Avatar>
            <span className="truncate max-w-[80px]">{(assignee.full_name || assignee.email)?.split(" ")[0]}</span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground italic flex items-center gap-1"><User className="h-3 w-3" /> sem responsável</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================
function EmptyBoard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center gap-3 text-muted-foreground">
      <div className="rounded-full bg-muted p-4"><Plus className="h-6 w-6" /></div>
      <div>
        <p className="font-semibold text-foreground">Nenhum funil criado</p>
        <p className="text-xs">Organize suas oportunidades comerciais em etapas customizáveis.</p>
      </div>
      <Button size="sm" onClick={onCreate}><Plus className="h-3.5 w-3.5 mr-1.5" /> Criar primeiro funil</Button>
    </div>
  );
}

// ============================================================================
// Funnel dialog
// ============================================================================
function FunnelDialog({
  initial, onClose, onSubmit, pending,
}: {
  initial?: { name: string; description: string; color: string };
  onClose: () => void;
  onSubmit: (v: { name: string; description?: string; color?: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? "#3B82F6");
  const canSubmit = name.trim().length >= 2 && !pending;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar funil" : "Novo funil"}</DialogTitle>
          <DialogDescription>Cada funil possui suas próprias etapas e cards.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Comercial, Renovação, Cobrança..." maxLength={80} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cor</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => onSubmit({ name: name.trim(), description: description.trim() || undefined, color })}>
            {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {initial ? "Salvar" : "Criar funil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Stage dialog
// ============================================================================
function StageDialog({
  initial, onClose, onSubmit, pending,
}: {
  initial?: { name: string; color: string; kind: "open" | "won" | "lost" };
  onClose: () => void;
  onSubmit: (v: { name: string; color?: string; kind?: "open" | "won" | "lost" }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#94a3b8");
  const [kind, setKind] = useState<"open" | "won" | "lost">(initial?.kind ?? "open");
  const canSubmit = name.trim().length >= 1 && !pending;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          <DialogDescription>Etapas "Ganho" e "Perda" fecham o card automaticamente ao receber um contato.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Em andamento</SelectItem>
                  <SelectItem value="won">Ganho</SelectItem>
                  <SelectItem value="lost">Perda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => onSubmit({ name: name.trim(), color, kind })}>
            {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {initial ? "Salvar" : "Criar etapa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Add card
// ============================================================================
function AddCardDialog({
  funnelId, members, onClose, onSubmit, pending,
}: {
  funnelId: string;
  members: any[];
  onClose: () => void;
  onSubmit: (v: { contactId: string; valueCents?: number; assignedUserId?: string | null; title?: string | null }) => void;
  pending: boolean;
}) {
  const _listContacts = useServerFn(listAvailableContacts);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["funnel-available-contacts", funnelId, search],
    queryFn: () => _listContacts({ data: { funnelId, search } }),
  });

  const canSubmit = !!contactId && !pending;
  const valueCents = value ? Math.round(parseFloat(value.replace(",", ".")) * 100) : 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar card ao funil</DialogTitle>
          <DialogDescription>O card usa o mesmo contato canônico do CRM — nenhuma duplicidade de identidade é criada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Selecionar contato *</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar por nome, telefone ou e-mail..." className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border divide-y">
              {q.isPending ? (
                <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline-block" /></div>
              ) : (q.data ?? []).length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Nenhum contato disponível{search ? ` para "${search}"` : ""}.</p>
              ) : (q.data ?? []).map((c: any) => (
                <label key={c.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 ${contactId === c.id ? "bg-primary/5" : ""}`}>
                  <input type="radio" name="contact" checked={contactId === c.id} onChange={() => setContactId(c.id)} />
                  <Avatar className="h-7 w-7"><AvatarImage src={c.avatar_url ?? undefined} /><AvatarFallback className="text-[10px]">{initials(c.name)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.phone || c.email || "—"}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título (opcional)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Registro de marca X" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Responsável</Label>
            <Select value={assignee ?? "none"} onValueChange={(v) => setAssignee(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => onSubmit({
            contactId: contactId!, valueCents, title: title.trim() || null, assignedUserId: assignee,
          })}>
            {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Card drawer (details + history)
// ============================================================================
function CardDrawer({
  cardId, card, members, stages, onClose, onSave, onArchive, onMove,
}: {
  cardId: string; card?: any; members: any[]; stages: any[];
  onClose: () => void;
  onSave: (patch: any) => void;
  onArchive: () => void;
  onMove: (stageId: string) => void;
}) {
  const _listEvents = useServerFn(listCardEvents);
  const [title, setTitle] = useState(card?.title ?? "");
  const [value, setValue] = useState(String((card?.value_cents ?? 0) / 100));
  const [assignee, setAssignee] = useState<string | null>(card?.assigned_user_id ?? null);
  const [stageId, setStageId] = useState<string>(card?.stage_id ?? stages[0]?.id);

  useEffect(() => {
    setTitle(card?.title ?? "");
    setValue(String((card?.value_cents ?? 0) / 100));
    setAssignee(card?.assigned_user_id ?? null);
    setStageId(card?.stage_id ?? stages[0]?.id);
  }, [card, stages]);

  const eventsQ = useQuery({
    queryKey: ["funnel-card-events", cardId],
    queryFn: () => _listEvents({ data: { cardId } }),
  });

  const stageById = useMemo(() => {
    const m = new Map<string, any>(); for (const s of stages) m.set(s.id, s); return m;
  }, [stages]);
  const memberById = useMemo(() => {
    const m = new Map<string, any>(); for (const p of members) m.set(p.id, p); return m;
  }, [members]);

  if (!card) return null;
  const contact = card.contact;

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Avatar className="h-8 w-8"><AvatarImage src={contact?.avatar_url ?? undefined} /><AvatarFallback>{initials(contact?.name)}</AvatarFallback></Avatar>
            {contact?.name ?? "Contato"}
          </SheetTitle>
          <SheetDescription>{contact?.phone || contact?.email || ""}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Etapa</Label>
              <Select value={stageId} onValueChange={(v) => { setStageId(v); onMove(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável</Label>
              <Select value={assignee ?? "none"} onValueChange={(v) => setAssignee(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={onArchive}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Arquivar
            </Button>
            <Button size="sm" onClick={() => onSave({
              title: title.trim() || null,
              valueCents: Math.round(parseFloat((value || "0").replace(",", ".")) * 100),
              assignedUserId: assignee,
            })}>Salvar</Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <History className="h-3.5 w-3.5" /> Histórico
            </p>
            {eventsQ.isPending ? (
              <p className="text-xs text-muted-foreground"><Loader2 className="h-3 w-3 inline animate-spin" /> Carregando...</p>
            ) : (eventsQ.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem eventos.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(eventsQ.data ?? []).map((ev: any) => {
                  const from = ev.from_stage_id ? stageById.get(ev.from_stage_id)?.name : null;
                  const to = ev.to_stage_id ? stageById.get(ev.to_stage_id)?.name : null;
                  const actor = ev.actor_id ? memberById.get(ev.actor_id) : null;
                  return (
                    <li key={ev.id} className="rounded-lg border border-border/60 bg-card/40 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold uppercase tracking-wide text-[10px] text-primary">{ev.event_type}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(ev.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      {(from || to) && (
                        <p className="mt-1 text-muted-foreground">
                          {from ? <>de <b className="text-foreground">{from}</b></> : null} {to ? <>para <b className="text-foreground">{to}</b></> : null}
                        </p>
                      )}
                      {actor && <p className="text-[10px] text-muted-foreground">por {actor.full_name || actor.email}</p>}
                      {ev.meta && Object.keys(ev.meta).length > 0 && (
                        <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">{JSON.stringify(ev.meta)}</pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
