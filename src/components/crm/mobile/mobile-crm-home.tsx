import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Plus,
  Building2,
  Phone,
  MessageSquare,
  MoreVertical,
  SlidersHorizontal,
  ListFilter,
  Columns3,
  Sparkles,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientTime } from "@/components/client-time";
import { LeadScorePill } from "@/components/crm/lead-score";
import { ContactFormSheet } from "@/components/crm/contact-form-sheet";
import { TagsMultiSelect } from "@/components/crm/tags-multiselect";
import { STAGES } from "@/components/crm/views/kanban-view";
import { useRealtimeContacts } from "@/hooks/use-realtime-contacts";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { listContacts } from "@/lib/crm.functions";
import { listTags } from "@/lib/inbox.functions";
import { cn } from "@/lib/utils";

type ChipId = "all" | "novo" | "negociacao" | "fechado" | "perdido";
const CHIPS: Array<{ id: ChipId; label: string; stages: string[] }> = [
  { id: "all", label: "Todos", stages: [] },
  { id: "novo", label: "Novos", stages: ["novo", "contato"] },
  { id: "negociacao", label: "Em negociação", stages: ["qualificado", "proposta", "negociacao"] },
  { id: "fechado", label: "Clientes", stages: ["fechado"] },
  { id: "perdido", label: "Perdidos", stages: ["perdido"] },
];

type ViewMode = "list" | "kanban";

export function MobileCrmHome() {
  useRealtimeContacts();
  const navigate = useNavigate();
  const { setAction } = useMobileFab();

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ChipId>("all");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>("list");
  const [openNew, setOpenNew] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);

  const listFn = useServerFn(listContacts);
  const tagsFn = useServerFn(listTags);

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => tagsFn() });

  const listQuery = useQuery({
    queryKey: ["contacts", { search, tagIds, sort: "recent", page: 1, pageSize: 100 }],
    queryFn: () => listFn({ data: { search, tagIds, sort: "recent", page: 1, pageSize: 100 } }),
  });

  const rows = listQuery.data?.rows ?? [];
  const stages = CHIPS.find((c) => c.id === chip)?.stages ?? [];
  const filtered = useMemo(() => {
    if (stages.length === 0) return rows;
    return rows.filter((r) => stages.includes((r.stage ?? "novo").toLowerCase()));
  }, [rows, stages]);

  // FAB — novo contato
  useEffect(() => {
    setAction({ label: "Novo contato", icon: Plus, onClick: () => setOpenNew(true) });
    return () => setAction(null);
  }, [setAction]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky search + view toggle */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border/40 bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contatos…"
              className="h-11 rounded-full pl-9 pr-9 text-base"
              inputMode="search"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label="Limpar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setOpenFilters(true)}
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border/60",
              tagIds.length > 0 && "border-primary/60 text-primary",
            )}
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>

        {/* Chips */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChip(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                chip === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} contato{filtered.length === 1 ? "" : "s"}
          </span>
          <div className="flex rounded-full border border-border/60 p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
                view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <ListFilter className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              onClick={() => setView("kanban")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
                view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <Columns3 className="h-3.5 w-3.5" /> Funil
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto momentum-scroll">
        {listQuery.isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={() => setOpenNew(true)} filtered={search.length > 0 || chip !== "all" || tagIds.length > 0} />
        ) : view === "list" ? (
          <ul className="flex flex-col gap-2 p-3">
            {filtered.map((c) => (
              <MobileContactCard
                key={c.id}
                c={c}
                onOpen={() => navigate({ to: "/crm/$contactId", params: { contactId: c.id } })}
              />
            ))}
          </ul>
        ) : (
          <MobileKanban rows={filtered} />
        )}
      </div>

      {/* New contact */}
      <ContactFormSheet open={openNew} onOpenChange={setOpenNew} />

      {/* Filters */}
      <Sheet open={openFilters} onOpenChange={setOpenFilters}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="grid gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Tags</span>
              <TagsMultiSelect tags={tags} selectedIds={tagIds} onChange={setTagIds} />
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                setTagIds([]);
                setChip("all");
                setSearch("");
              }}
            >
              Limpar filtros
            </Button>
            <Button className="w-full" onClick={() => setOpenFilters(false)}>
              Aplicar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Row = ReturnType<() => Awaited<ReturnType<typeof listContacts>>["rows"][number]>;

function MobileContactCard({ c, onOpen }: { c: Row; onOpen: () => void }) {
  const stageLabel = STAGES.find((s) => s.id === (c.stage ?? "").toLowerCase())?.label;
  const digits = (c.phone ?? "").replace(/\D/g, "");
  const wa = digits ? `https://wa.me/${digits}` : null;

  return (
    <li>
      <div className="group relative flex items-start gap-3 rounded-2xl border border-border/50 bg-card p-3 shadow-xs active:bg-accent/40">
        <button onClick={onOpen} className="flex flex-1 items-start gap-3 text-left">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/15 text-base font-bold text-primary">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[15px] font-semibold">{c.name}</p>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                <ClientTime iso={c.last_interaction_at} />
              </span>
            </div>
            {c.company_name && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" /> {c.company_name}
              </p>
            )}
            {c.phone && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground tabular-nums">
                <Phone className="h-3 w-3 shrink-0" /> {c.phone}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <LeadScorePill score={c.lead_score} />
              {stageLabel && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                  {stageLabel}
                </Badge>
              )}
              {c.tags.slice(0, 2).map((t) => (
                <Badge
                  key={t.id}
                  variant="secondary"
                  className="h-5 border-0 px-1.5 text-[10px]"
                  style={{ backgroundColor: t.color + "22", color: t.color }}
                >
                  {t.name}
                </Badge>
              ))}
              {c.tags.length > 2 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  +{c.tags.length - 2}
                </Badge>
              )}
            </div>
            {c.next_action && (
              <p className="mt-1.5 truncate text-[11px] italic text-muted-foreground">
                → {c.next_action}
              </p>
            )}
          </div>
        </button>

        {/* Quick actions */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366]/15 text-[#128C7E] active:scale-95"
              aria-label="Abrir WhatsApp"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
          )}
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground active:scale-95"
              aria-label="Ligar"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function MobileKanban({ rows }: { rows: Row[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    STAGES.forEach((s) => m.set(s.id, []));
    for (const r of rows) {
      const key = (r.stage ?? "novo").toLowerCase();
      (m.get(key) ?? m.get("novo")!).push(r);
    }
    return m;
  }, [rows]);

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 py-3">
      {STAGES.map((s) => {
        const cards = grouped.get(s.id) ?? [];
        const totalValue = cards.reduce((sum, c) => sum + (c.value_cents ?? 0), 0);
        return (
          <section
            key={s.id}
            className="flex w-[85vw] shrink-0 snap-center flex-col gap-2 rounded-2xl border border-border/50 bg-muted/30 p-3"
          >
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  {s.label}
                </h3>
                <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {cards.length}
                </span>
              </div>
              {totalValue > 0 && (
                <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                  }).format(totalValue / 100)}
                </span>
              )}
            </header>
            {cards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-[11px] text-muted-foreground">
                Nenhum contato
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {cards.map((c) => (
                  <Link
                    key={c.id}
                    to="/crm/$contactId"
                    params={{ contactId: c.id }}
                    className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-card p-3 no-underline active:bg-accent/40"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        {c.company_name && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {c.company_name}
                          </p>
                        )}
                      </div>
                      <LeadScorePill score={c.lead_score} />
                    </div>
                    {c.value_cents != null && c.value_cents > 0 && (
                      <span className="text-sm font-bold tabular-nums">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        }).format(c.value_cents / 100)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function EmptyState({ onNew, filtered }: { onNew: () => void; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold">
        {filtered ? "Nenhum contato encontrado" : "Nenhum contato ainda"}
      </p>
      <p className="text-sm text-muted-foreground">
        {filtered
          ? "Ajuste os filtros ou tente outra busca."
          : "Comece adicionando seu primeiro cliente."}
      </p>
      {!filtered && (
        <Button size="sm" onClick={onNew} className="mt-2">
          <Plus className="mr-1.5 h-4 w-4" /> Novo contato
        </Button>
      )}
    </div>
  );
}
