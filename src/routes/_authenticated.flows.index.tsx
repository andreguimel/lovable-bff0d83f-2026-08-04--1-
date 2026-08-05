import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
  ArchiveRestore,
  Archive,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClientTime } from "@/components/client-time";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createFlow,
  createFlowFromTemplate,
  deleteFlow,
  duplicateFlow,
  listFlows,
  listFlowTemplates,
  setFlowStatus,
} from "@/lib/flows.functions";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFlowsHome } from "@/components/flows/mobile/mobile-flows-home";

type FlowStatus = "active" | "draft" | "archived";

export const Route = createFileRoute("/_authenticated/flows/")({
  head: () => ({
    meta: [
      { title: "Flow Studio — Zenda" },
      {
        name: "description",
        content:
          "Automações visuais com IA: crie, teste e publique fluxos inteligentes em minutos.",
      },
    ],
  }),
  component: FlowsRoute,
});

function FlowsRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileFlowsHome /> : <FlowsHome />;
}

function FlowsHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(listFlows);
  const createFn = useServerFn(createFlow);
  const createFromTplFn = useServerFn(createFlowFromTemplate);
  const listTplFn = useServerFn(listFlowTemplates);
  const deleteFn = useServerFn(deleteFlow);
  const dupFn = useServerFn(duplicateFlow);
  const setStatusFn = useServerFn(setFlowStatus);

  const { data: templates = [] } = useQuery({
    queryKey: ["flow-templates"],
    queryFn: () => listTplFn(),
  });

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["flows-list"],
    queryFn: () => fn(),
  });

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<
    "manual" | "inbound_message" | "keyword" | "transfer" | "new_contact"
  >("manual");
  const [statusFilter, setStatusFilter] = useState<"all" | FlowStatus>("all");
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [tplSlug, setTplSlug] = useState<string>("blank");

  const kpis = useMemo(() => {
    const total = flows.length;
    const active = flows.filter((f) => f.status === "active").length;
    const runs = flows.reduce((acc, f) => acc + (f.runs_count ?? 0), 0);
    const withSuccess = flows.filter((f) => typeof f.success_rate === "number");
    const avgSuccess =
      withSuccess.length > 0
        ? Math.round(
            withSuccess.reduce((acc, f) => acc + (f.success_rate ?? 0), 0) /
              withSuccess.length,
          )
        : null;
    const failed = flows.filter((f) => f.last_run_status === "failed").length;
    return { total, active, runs, avgSuccess, failed };
  }, [flows]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (tplSlug && tplSlug !== "blank") {
        return createFromTplFn({
          data: { slug: tplSlug, name, description: description || undefined },
        });
      }
      return createFn({ data: { name, description: description || undefined, triggerType } });
    },
    onSuccess: ({ id }) => {
      toast.success("Fluxo criado.");
      setNewOpen(false);
      setName("");
      setDescription("");
      setTriggerType("manual");
      setTplSlug("blank");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
      navigate({ to: "/flows/$flowId", params: { flowId: id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { flowId: id } }),
    onSuccess: () => {
      toast.success("Fluxo excluído.");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => dupFn({ data: { flowId: id } }),
    onSuccess: () => {
      toast.success("Fluxo duplicado.");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao duplicar"),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: FlowStatus }) =>
      setStatusFn({ data: { flowId: v.id, status: v.status } }),
    onSuccess: (_r, v) => {
      toast.success(
        v.status === "archived"
          ? "Fluxo arquivado."
          : v.status === "active"
            ? "Fluxo ativado."
            : "Fluxo desarquivado.",
      );
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar status"),
  });

  const filtered = flows.filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (q && !f.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-3 w-3" /> Flow Studio
          </p>
          <h1 className="font-display text-2xl font-bold">Automações visuais</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Desenhe conversas com IA, teste em tempo real e publique em canais reais.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {
              setTplSlug("blank");
              setNewOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Novo fluxo
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-gradient-to-r from-primary to-primary/80 shadow-md hover:from-primary/90 hover:to-primary/70"
            onClick={() => {
              setTplSlug("blank");
              setNewOpen(true);
            }}
          >
            <Sparkles className="h-4 w-4" /> Criar com IA
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Fluxos" value={kpis.total.toLocaleString("pt-BR")} hint={`${kpis.active} ativos`} />
        <Kpi
          label="Publicados"
          value={kpis.active.toLocaleString("pt-BR")}
          hint={kpis.total > 0 ? `${Math.round((kpis.active / kpis.total) * 100)}% do total` : "—"}
        />
        <Kpi
          label="Execuções"
          value={kpis.runs.toLocaleString("pt-BR")}
          hint="acumulado"
        />
        <Kpi
          label="Sucesso médio"
          value={kpis.avgSuccess != null ? `${kpis.avgSuccess}%` : "—"}
          hint="últimas 500 execuções"
        />
        <Kpi
          label="Com falha recente"
          value={kpis.failed.toLocaleString("pt-BR")}
          hint="última execução"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fluxo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="active">Ativos</TabsTrigger>
            <TabsTrigger value="draft">Rascunhos</TabsTrigger>
            <TabsTrigger value="archived">Arquivados</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">
              {flows.length === 0 ? "Nenhum fluxo ainda" : "Nenhum fluxo bate com o filtro"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {flows.length === 0
                ? "Comece com um template pronto ou peça à IA para criar um fluxo para você."
                : "Ajuste os filtros ou crie um novo fluxo."}
            </p>
            <Button size="sm" className="mt-4" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Criar fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => {
            const active = f.status === "active";
            return (
              <div key={f.id} className="flow-hero-card group">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/flows/$flowId"
                    params={{ flowId: f.id }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold group-hover:text-primary">
                        {f.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {f.description ?? "Sem descrição"}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={active ? "default" : "secondary"}
                      className={active ? "bg-success text-success-foreground" : ""}
                    >
                      {active ? "Ativo" : f.status === "archived" ? "Arquivado" : "Rascunho"}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => dupMut.mutate(f.id)}>
                          <Copy className="mr-2 h-4 w-4" /> Duplicar
                        </DropdownMenuItem>
                        {f.status === "archived" ? (
                          <DropdownMenuItem
                            onClick={() => statusMut.mutate({ id: f.id, status: "draft" })}
                          >
                            <ArchiveRestore className="mr-2 h-4 w-4" /> Desarquivar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => statusMut.mutate({ id: f.id, status: "archived" })}
                          >
                            <Archive className="mr-2 h-4 w-4" /> Arquivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setToDelete({ id: f.id, name: f.name })}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {f.trigger_type}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
                  <MiniStat
                    icon={<Activity className="h-3 w-3" />}
                    label="Execuções"
                    value={f.runs_count.toLocaleString("pt-BR")}
                  />
                  <MiniStat
                    icon={<CheckCircle2 className="h-3 w-3" />}
                    label="Sucesso"
                    value={f.success_rate == null ? "—" : `${f.success_rate}%`}
                  />
                  <MiniStat
                    icon={
                      f.last_run_status === "completed" ? (
                        <CheckCircle2 className="h-3 w-3 text-success" />
                      ) : f.last_run_status === "failed" ? (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )
                    }
                    label="Última"
                    value={f.last_run_status ?? "—"}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {f.last_run_at ? (
                      <>
                        últ. exec.: <ClientTime iso={f.last_run_at} />
                      </>
                    ) : (
                      "nunca executado"
                    )}
                  </span>
                  <Link
                    to="/flows/$flowId/runs"
                    params={{ flowId: f.id }}
                    className="text-primary hover:underline"
                  >
                    ver execuções →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo fluxo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Começar com</Label>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => {
                  const active = tplSlug === t.slug;
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => setTplSlug(t.slug)}
                      className={
                        "rounded-lg border p-3 text-left transition-all " +
                        (active
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40 hover:bg-accent/40")
                      }
                    >
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {t.description}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t.nodeCount} nó(s)
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fname">Nome</Label>
              <Input
                id="fname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Triagem inicial"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fdesc">Descrição (opcional)</Label>
              <Textarea
                id="fdesc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para que serve este fluxo?"
              />
            </div>
            {tplSlug === "blank" && (
              <div className="grid gap-1.5">
                <Label>Gatilho inicial</Label>
                <Select
                  value={triggerType}
                  onValueChange={(v) => setTriggerType(v as typeof triggerType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (disparado pela equipe)</SelectItem>
                    <SelectItem value="inbound_message">Mensagem recebida</SelectItem>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                    <SelectItem value="transfer">Transferência de conversa</SelectItem>
                    <SelectItem value="new_contact">Novo contato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
              💡 <b>Dica:</b> depois de criar, use o botão <b>Copiloto IA</b> no canvas para gerar o
              fluxo completo com uma descrição em linguagem natural.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!name.trim() || createMut.isPending}
            >
              {createMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              <Play className="mr-1 h-4 w-4" /> Criar e abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{toDelete?.name}&quot; e todas as execuções serão removidos. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMut.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flows-kpi">
      <p className="flows-kpi__label">{label}</p>
      <p className="flows-kpi__value">{value}</p>
      {hint && <p className="flows-kpi__hint">{hint}</p>}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
