import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import {
  Plus,
  Search,
  Upload,
  Download,
  Settings2,
  Trash2,
  MessageSquare,
  MoreHorizontal,
  Tag as TagIcon,
  UserPlus,
  Sparkles,
  Building2,
  TrendingUp,
  Users,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ClientTime } from "@/components/client-time";
import { TagsMultiSelect } from "@/components/crm/tags-multiselect";
import { ContactFormSheet } from "@/components/crm/contact-form-sheet";
import { ImportCsvDialog } from "@/components/crm/import-csv-dialog";
import { CustomFieldsManager } from "@/components/crm/custom-fields-manager";
import { LeadScorePill } from "@/components/crm/lead-score";
import { ViewSwitcher, type CrmView } from "@/components/crm/view-switcher";
import { KanbanView } from "@/components/crm/views/kanban-view";
import { CardsView } from "@/components/crm/views/cards-view";
import { useRealtimeContacts } from "@/hooks/use-realtime-contacts";
import { listContacts, deleteContacts, bulkTag } from "@/lib/crm.functions";
import { listTags } from "@/lib/inbox.functions";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCrmHome } from "@/components/crm/mobile/mobile-crm-home";

export const Route = createFileRoute("/_authenticated/crm/")({
  head: () => ({ meta: [{ title: "CRM — Centro de Clientes" }] }),
  component: CrmRoute,
});

function CrmRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileCrmHome /> : <CrmHome />;
}

const brl = (cents: number | null) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);

function CrmHome() {
  useRealtimeContacts();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sort, setSort] = useState<"recent" | "name" | "created">("recent");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [view, setView] = useState<CrmView>("list");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("crm.view") : null;
    if (saved) setView(saved as CrmView);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("crm.view", view);
  }, [view]);

  const [importTab, setImportTab] = useState<"import" | "export">("import");
  const [openNew, setOpenNew] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [openCF, setOpenCF] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const listFn = useServerFn(listContacts);
  const tagsFn = useServerFn(listTags);
  const delFn = useServerFn(deleteContacts);
  const bulkTagFn = useServerFn(bulkTag);

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => tagsFn() });

  const listQuery = useQuery({
    queryKey: ["contacts", { search, tagIds, sort, page, pageSize }],
    queryFn: () => listFn({ data: { search, tagIds, sort, page, pageSize } }),
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // KPIs derived from current page (fast, non-blocking)
  const kpis = useMemo(() => {
    const newThisWeek = rows.filter((r) => {
      const d = new Date(r.created_at).getTime();
      return Date.now() - d < 7 * 86400000;
    }).length;
    const inNegotiation = rows.filter((r) =>
      ["proposta", "negociacao"].includes((r.stage ?? "").toLowerCase()),
    ).length;
    const pipelineValue = rows.reduce((s, r) => s + (r.value_cents ?? 0), 0);
    return { total, newThisWeek, inNegotiation, pipelineValue };
  }, [rows, total]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { ids: [...selected] } }),
    onSuccess: (r) => {
      toast.success(`${r.count} contato(s) removidos`);
      setSelected(new Set());
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyTag = useMutation({
    mutationFn: (input: { tagId: string; add: boolean }) =>
      bulkTagFn({ data: { ids: [...selected], ...input } }),
    onSuccess: () => {
      toast.success("Tag aplicada");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportSelected = async () => {
    const target = selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows;
    const csv = Papa.unparse(
      target.map((r) => ({
        nome: r.name,
        empresa: r.company_name ?? "",
        telefone: r.phone ?? "",
        email: r.email ?? "",
        estagio: r.stage ?? "",
        valor: r.value_cents ? r.value_cents / 100 : "",
        score: r.lead_score,
        tags: r.tags.map((t) => t.name).join(", "),
        ultima_interacao: r.last_interaction_at ?? "",
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${target.length} exportados`);
  };

  const isEmpty = !listQuery.isLoading && rows.length === 0;
  const emptyBecauseFilter = isEmpty && (search || tagIds.length > 0);

  const pageNumbers = useMemo(() => {
    const arr: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight">CRM</h1>
          <p className="text-sm text-muted-foreground">
            Centro inteligente de clientes · {total} contato{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpenCF(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Campos
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setImportTab("import"); setOpenImport(true); }}>
            <Upload className="mr-1.5 h-4 w-4" /> Importar
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setImportTab("export"); setOpenImport(true); }}>
            <Download className="mr-1.5 h-4 w-4" /> Exportar
          </Button>
          <Button size="sm" onClick={() => setOpenNew(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo contato
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total de contatos" value={String(kpis.total)} icon={<Users className="h-4 w-4" />} />
        <Kpi label="Novos (7 dias)" value={String(kpis.newThisWeek)} icon={<TrendingUp className="h-4 w-4" />} accent="emerald" />
        <Kpi label="Em negociação" value={String(kpis.inNegotiation)} icon={<Building2 className="h-4 w-4" />} accent="amber" />
        <Kpi label="Pipeline" value={brl(kpis.pipelineValue)} icon={<DollarSign className="h-4 w-4" />} accent="primary" />
      </div>

      {/* SEARCH + FILTERS + VIEW */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nome, telefone, empresa, e-mail…"
            className="h-10 pl-9 pr-24"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </span>
        </div>
        <Button size="sm" variant="outline" className="h-10 gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Buscar com IA
        </Button>
        <TagsMultiSelect
          tags={tags}
          selectedIds={tagIds}
          onChange={(v) => {
            setTagIds(v);
            setPage(1);
          }}
          placeholder="Filtrar tags"
        />
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="h-10 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Última interação</SelectItem>
            <SelectItem value="name">Nome (A-Z)</SelectItem>
            <SelectItem value="created">Mais recentes</SelectItem>
          </SelectContent>
        </Select>
        <ViewSwitcher value={view} onChange={setView} />
      </div>

      {/* BULK ACTIONS */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selecionado(s)</span>
          <span className="ml-auto flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <TagIcon className="mr-1.5 h-3.5 w-3.5" /> Tag
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {tags.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => applyTag.mutate({ tagId: t.id, add: true })}>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {tags.map((t) => (
                  <DropdownMenuItem key={`r-${t.id}`} onClick={() => applyTag.mutate({ tagId: t.id, add: false })}>
                    Remover: {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={exportSelected}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
            </Button>
          </span>
        </div>
      )}

      {/* CONTENT */}
      {listQuery.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          filter={!!emptyBecauseFilter}
          onNew={() => setOpenNew(true)}
          onImport={() => setOpenImport(true)}
        />
      ) : view === "kanban" ? (
        <KanbanView contacts={rows} />
      ) : view === "cards" ? (
        <CardsView rows={rows} />
      ) : view === "table" || view === "list" ? (
        <ListLikeView
          rows={rows}
          selected={selected}
          allChecked={allChecked}
          toggleAll={toggleAll}
          toggleOne={toggleOne}
          onDelete={(id) => {
            setSelected(new Set([id]));
            setConfirmDelete(true);
          }}
          onOpen={(id) => navigate({ to: "/crm/$contactId", params: { contactId: id } })}
          dense={view === "table"}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 p-12 text-center text-sm text-muted-foreground">
          Visualização em <b>{view}</b> em breve. Enquanto isso, use lista, cards ou kanban.
        </div>
      )}

      {/* PAGINATION */}
      {(view === "list" || view === "table" || view === "cards") && !isEmpty && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Por página:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            {rows.length > 0 && (
              <span>{(page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} de {total}</span>
            )}
          </div>

          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {pageNumbers.map((n) => (
                  <PaginationItem key={n}>
                    <PaginationLink isActive={n === page} onClick={() => setPage(n)} className="cursor-pointer">
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      <ContactFormSheet open={openNew} onOpenChange={setOpenNew} />
      <ImportCsvDialog open={openImport} onOpenChange={setOpenImport} defaultTab={importTab} />
      <CustomFieldsManager open={openCF} onOpenChange={setOpenCF} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação move para lixeira. Selecionados: {selected.size}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => delMut.mutate()} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "emerald" | "amber" | "primary";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
        : accent === "primary"
          ? "text-primary bg-primary/10"
          : "text-muted-foreground bg-muted";
  return (
    <div className="crm-kpi">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg", accentClass)}>{icon}</span>
      </div>
      <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

function EmptyState({
  filter,
  onNew,
  onImport,
}: {
  filter: boolean;
  onNew: () => void;
  onImport: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <UserPlus className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-semibold">
        {filter ? "Nenhum contato encontrado" : "Nenhum contato ainda"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filter ? "Ajuste os filtros ou tente outra busca." : "Comece adicionando ou importando seus clientes."}
      </p>
      {!filter && (
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" onClick={onNew}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Novo contato
          </Button>
          <Button size="sm" variant="outline" onClick={onImport}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Importar CSV
          </Button>
        </div>
      )}
    </div>
  );
}

function ListLikeView({
  rows,
  selected,
  allChecked,
  toggleAll,
  toggleOne,
  onDelete,
  onOpen,
  dense,
}: {
  rows: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    stage: string | null;
    value_cents: number | null;
    lead_score: number;
    tags: Array<{ id: string; name: string; color: string }>;
    last_interaction_at: string | null;
  }>;
  selected: Set<string>;
  allChecked: boolean;
  toggleAll: () => void;
  toggleOne: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  dense: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Contato</TableHead>
            <TableHead className="hidden md:table-cell">Empresa</TableHead>
            <TableHead className="hidden lg:table-cell">Estágio</TableHead>
            <TableHead className="hidden md:table-cell">Score</TableHead>
            <TableHead className="hidden xl:table-cell">Tags</TableHead>
            <TableHead className="hidden md:table-cell text-right">Valor</TableHead>
            <TableHead className="hidden md:table-cell">Última interação</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id} className={cn("hover:bg-muted/40 cursor-pointer", dense && "h-10")}>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
              </TableCell>
              <TableCell onClick={() => onOpen(c.id)}>
                <div className="flex items-center gap-3">
                  <div className={cn("grid shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary", dense ? "h-8 w-8" : "h-10 w-10")}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    {c.phone ? (
                      <p className="truncate text-xs text-muted-foreground tabular-nums">{c.phone}</p>
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">{c.email ?? "—"}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground md:table-cell" onClick={() => onOpen(c.id)}>
                {c.company_name ?? "—"}
              </TableCell>
              <TableCell className="hidden lg:table-cell" onClick={() => onOpen(c.id)}>
                {c.stage ? (
                  <Badge variant="outline" className="capitalize">
                    {c.stage}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell" onClick={() => onOpen(c.id)}>
                <LeadScorePill score={c.lead_score} />
              </TableCell>
              <TableCell className="hidden xl:table-cell" onClick={() => onOpen(c.id)}>
                <div className="flex flex-wrap gap-1">
                  {c.tags.slice(0, 3).map((t) => (
                    <Badge
                      key={t.id}
                      variant="secondary"
                      className="border-0"
                      style={{ backgroundColor: t.color + "22", color: t.color }}
                    >
                      {t.name}
                    </Badge>
                  ))}
                  {c.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{c.tags.length - 3}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden text-right text-sm font-medium tabular-nums md:table-cell" onClick={() => onOpen(c.id)}>
                {brl(c.value_cents)}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground md:table-cell" onClick={() => onOpen(c.id)}>
                <ClientTime iso={c.last_interaction_at} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to="/crm/$contactId" params={{ contactId: c.id }}>
                        Ver detalhes
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/crm/$contactId" params={{ contactId: c.id }}>
                        <MessageSquare className="mr-2 h-3.5 w-3.5" /> Iniciar conversa
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(c.id)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
