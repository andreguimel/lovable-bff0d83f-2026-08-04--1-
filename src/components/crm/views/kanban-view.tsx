import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { GripVertical, Building2, Clock } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import { LeadScorePill } from "@/components/crm/lead-score";
import { updateContact } from "@/lib/crm.functions";
import { cn } from "@/lib/utils";

export const STAGES: Array<{ id: string; label: string; hint?: string }> = [
  { id: "novo", label: "Novo Lead" },
  { id: "contato", label: "Contato" },
  { id: "qualificado", label: "Qualificado" },
  { id: "proposta", label: "Proposta" },
  { id: "negociacao", label: "Negociação" },
  { id: "fechado", label: "Fechado" },
  { id: "perdido", label: "Perdido" },
];

type ContactCardData = {
  id: string;
  name: string;
  company_name: string | null;
  stage: string | null;
  value_cents: number | null;
  lead_score: number;
  last_interaction_at: string | null;
  next_action: string | null;
  tags: Array<{ id: string; name: string; color: string }>;
};

const brl = (cents: number | null) =>
  cents == null
    ? null
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);

function KanbanCardContent({ c }: { c: ContactCardData }) {
  const value = brl(c.value_cents);
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {c.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.name}</p>
          {c.company_name && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" /> {c.company_name}
            </p>
          )}
        </div>
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      </div>
      <div className="flex items-center justify-between gap-2">
        {value && <span className="text-sm font-bold tabular-nums">{value}</span>}
        <LeadScorePill score={c.lead_score} className="ml-auto" />
      </div>
      {c.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.tags.slice(0, 3).map((t) => (
            <Badge
              key={t.id}
              variant="secondary"
              className="h-4 border-0 px-1.5 text-[10px]"
              style={{ backgroundColor: t.color + "22", color: t.color }}
            >
              {t.name}
            </Badge>
          ))}
          {c.tags.length > 3 && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              +{c.tags.length - 3}
            </Badge>
          )}
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <ClientTime iso={c.last_interaction_at} />
        </span>
        {c.next_action && (
          <span className="truncate italic">→ {c.next_action}</span>
        )}
      </div>
    </>
  );
}

function DraggableCard({ c }: { c: ContactCardData }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && "opacity-40")}>
      <Link
        to="/crm/$contactId"
        params={{ contactId: c.id }}
        className="kanban-card block no-underline"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        <KanbanCardContent c={c} />
      </Link>
    </div>
  );
}

function DroppableColumn({
  stage,
  cards,
}: {
  stage: (typeof STAGES)[number];
  cards: ContactCardData[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = cards.reduce((s, c) => s + (c.value_cents ?? 0), 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "kanban-col shrink-0 transition-colors",
        isOver && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {stage.label}
          </h3>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {cards.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {brl(totalValue)}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {cards.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground">
              Arraste um contato aqui
            </div>
          )}
          {cards.map((c) => (
            <DraggableCard key={c.id} c={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function KanbanView({ contacts }: { contacts: ContactCardData[] }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateContact);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, ContactCardData[]>();
    STAGES.forEach((s) => map.set(s.id, []));
    for (const c of contacts) {
      const key = (c.stage ?? "novo").toLowerCase();
      const bucket = map.get(key) ?? map.get("novo")!;
      bucket.push(c);
    }
    return map;
  }, [contacts]);

  const move = useMutation({
    mutationFn: (v: { id: string; stage: string }) =>
      updateFn({ data: { id: v.id, funnel_stage: v.stage } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Estágio atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const contactId = String(e.active.id);
    const stage = String(overId);
    const c = contacts.find((x) => x.id === contactId);
    if (!c || c.stage === stage) return;
    move.mutate({ id: contactId, stage });
  };

  const activeCard = contacts.find((c) => c.id === activeId) ?? null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((s) => (
          <DroppableColumn key={s.id} stage={s} cards={grouped.get(s.id) ?? []} />
        ))}
      </div>
      <DragOverlay>
        {activeCard && (
          <div className="kanban-card w-72 rotate-1 shadow-lg">
            <KanbanCardContent c={activeCard} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
