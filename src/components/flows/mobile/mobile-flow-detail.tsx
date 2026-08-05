import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  Maximize2,
  MoreVertical,
  Play,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientTime } from "@/components/client-time";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createFlowVersion,
  deleteFlow,
  duplicateFlow,
  getFlowGraph,
  listFlowRuns,
  runFlowTest,
  setFlowStatus,
} from "@/lib/flows.functions";
import { BLOCKS, type NodeKind } from "@/components/flows/studio/blocks";

type Tab = "resumo" | "timeline" | "execucoes" | "nos";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "timeline", label: "Timeline" },
  { id: "execucoes", label: "Execuções" },
  { id: "nos", label: "Nós" },
];

export function MobileFlowDetail({
  flowId,
  onOpenDesktopEditor,
}: {
  flowId: string;
  onOpenDesktopEditor: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("resumo");
  const [menuOpen, setMenuOpen] = useState(false);
  const [nodeSheet, setNodeSheet] = useState<null | { id: string; kind: NodeKind; data: Record<string, unknown> }>(
    null,
  );

  const getGraph = useServerFn(getFlowGraph);
  const getRuns = useServerFn(listFlowRuns);
  const createVersionFn = useServerFn(createFlowVersion);
  const setStatusFn = useServerFn(setFlowStatus);
  const testFn = useServerFn(runFlowTest);
  const dupFn = useServerFn(duplicateFlow);
  const delFn = useServerFn(deleteFlow);

  const { data, isLoading } = useQuery({
    queryKey: ["flow-graph", flowId],
    queryFn: () => getGraph({ data: { flowId } }),
  });
  const { data: runsData } = useQuery({
    queryKey: ["flow-runs", flowId],
    queryFn: () => getRuns({ data: { flowId, limit: 50 } }),
    enabled: tab === "execucoes" || tab === "resumo",
    refetchInterval: tab === "execucoes" ? 15_000 : false,
  });

  const orderedNodes = useMemo(() => {
    if (!data) return [];
    const start = data.nodes.find((n) => (n.node_type as NodeKind) === "start");
    const rest = data.nodes.filter((n) => (n.node_type as NodeKind) !== "start");
    return start ? [start, ...rest] : data.nodes;
  }, [data]);

  const publishMut = useMutation<unknown, Error>({
    mutationFn: () => {
      if (data?.flow.status === "active") {
        return setStatusFn({ data: { flowId, status: "draft" } });
      }
      return createVersionFn({
        data: {
          flowId,
          publish: true,
          description: "Publicada pelo detalhe mobile de fluxos",
        },
      });
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const testMut = useMutation({
    mutationFn: () => testFn({ data: { flowId } }),
    onSuccess: (r) => {
      toast.success(`Teste executado — status ${r.status}`);
      qc.invalidateQueries({ queryKey: ["flow-runs", flowId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no teste"),
  });

  const dupMut = useMutation({
    mutationFn: () => dupFn({ data: { flowId } }),
    onSuccess: () => {
      toast.success("Fluxo duplicado");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
      navigate({ to: "/flows" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { flowId } }),
    onSuccess: () => {
      toast.success("Fluxo excluído");
      navigate({ to: "/flows" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = data.flow.status === "active";
  const runs = runsData?.runs ?? [];
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const lastRun = runs[0];

  return (
    <div className="flex flex-col pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <Button asChild size="icon" variant="ghost" className="h-9 w-9">
          <Link to="/flows">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{data.flow.name}</p>
          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {data.flow.trigger_type} · {data.nodes.length} nós
          </p>
        </div>
        <Badge
          variant={active ? "default" : "secondary"}
          className={active ? "bg-success text-success-foreground" : ""}
        >
          {active ? "Ativo" : data.flow.status}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => setMenuOpen(true)}
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="-mx-0 flex gap-1 overflow-x-auto border-b bg-background px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors " +
              (tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3 px-4 pt-4">
        {tab === "resumo" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MiniKpi label="Nós" value={String(data.nodes.length)} />
              <MiniKpi label="Conexões" value={String(data.edges.length)} />
              <MiniKpi label="Execuções (50)" value={String(totalRuns)} />
              <MiniKpi
                label="Sucesso"
                value={totalRuns > 0 ? `${Math.round((completedRuns / totalRuns) * 100)}%` : "—"}
              />
            </div>
            {failedRuns > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <XCircle className="h-4 w-4 text-destructive" />
                <span>{failedRuns} execução(ões) com falha nas últimas 50</span>
              </div>
            )}
            {lastRun && (
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Última execução
                </p>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <StatusIcon status={lastRun.status} />
                  <span className="truncate">
                    <ClientTime iso={lastRun.started_at} />
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending}
              >
                {testMut.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-1 h-4 w-4" />
                )}
                Testar
              </Button>
              <Button
                className="h-11"
                onClick={() => publishMut.mutate()}
                disabled={publishMut.isPending}
              >
                {publishMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {active ? "Despublicar" : "Publicar"}
              </Button>
            </div>
            <Button
              variant="ghost"
              className="h-11 justify-between"
              onClick={onOpenDesktopEditor}
            >
              <span className="flex items-center gap-2 text-sm">
                <Maximize2 className="h-4 w-4" /> Abrir editor completo
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </>
        )}

        {tab === "timeline" && (
          <div className="flex flex-col">
            {orderedNodes.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum nó ainda. Use o editor completo para adicionar blocos.
              </p>
            )}
            {orderedNodes.map((n, i) => {
              const kind = (n.node_type as NodeKind) ?? "message";
              const meta = BLOCKS[kind] ?? BLOCKS.message;
              const Icon = meta.icon;
              const label =
                ((n.data as Record<string, unknown>)?.label as string) ?? meta.label;
              return (
                <div key={n.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                      style={{ background: meta.accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {i < orderedNodes.length - 1 && (
                      <div className="my-1 w-px flex-1 bg-border" />
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setNodeSheet({
                        id: n.id,
                        kind,
                        data: (n.data as Record<string, unknown>) ?? {},
                      })
                    }
                    className="mb-3 flex-1 rounded-xl border bg-card p-3 text-left active:scale-[0.99]"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                    </p>
                    <p className="mt-0.5 text-sm font-medium">{label}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {meta.short}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "execucoes" && (
          <div className="flex flex-col gap-2">
            {runs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma execução ainda.
              </p>
            ) : (
              runs.map((r) => {
                const contact = (r.conversation as {
                  id: string;
                  contact: { id: string; name: string } | null;
                } | null)?.contact;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-xl border bg-card p-3"
                  >
                    <StatusIcon status={r.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {contact?.name ?? "Sem contato"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        <ClientTime iso={r.started_at} /> · {r.messages_sent} msg
                      </p>
                      {r.error && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-destructive">
                          {r.error}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "nos" && (
          <div className="flex flex-col gap-2">
            {data.nodes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum nó configurado.
              </p>
            ) : (
              data.nodes.map((n) => {
                const kind = (n.node_type as NodeKind) ?? "message";
                const meta = BLOCKS[kind] ?? BLOCKS.message;
                const Icon = meta.icon;
                const label =
                  ((n.data as Record<string, unknown>)?.label as string) ?? meta.label;
                return (
                  <button
                    key={n.id}
                    onClick={() =>
                      setNodeSheet({
                        id: n.id,
                        kind,
                        data: (n.data as Record<string, unknown>) ?? {},
                      })
                    }
                    className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left"
                  >
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
                      style={{ background: meta.accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {meta.label}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Node detail sheet */}
      <Sheet open={nodeSheet !== null} onOpenChange={(v) => !v && setNodeSheet(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          {nodeSheet && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  {(nodeSheet.data.label as string) ?? BLOCKS[nodeSheet.kind]?.label ?? "Nó"}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-3 flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Tipo
                  </p>
                  <p>{BLOCKS[nodeSheet.kind]?.label ?? nodeSheet.kind}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Descrição
                  </p>
                  <p className="text-muted-foreground">
                    {BLOCKS[nodeSheet.kind]?.short ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dados
                  </p>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted p-2 text-[11px]">
                    {JSON.stringify(nodeSheet.data, null, 2)}
                  </pre>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setNodeSheet(null);
                    onOpenDesktopEditor();
                  }}
                >
                  <Maximize2 className="mr-1 h-4 w-4" /> Editar no editor completo
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Menu sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Ações</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-1">
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent"
              onClick={() => {
                setMenuOpen(false);
                onOpenDesktopEditor();
              }}
            >
              <Maximize2 className="h-4 w-4" /> Abrir editor completo
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent"
              onClick={() => {
                setMenuOpen(false);
                dupMut.mutate();
              }}
            >
              <Copy className="h-4 w-4" /> Duplicar fluxo
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent"
              onClick={() =>
                setStatusFn({ data: { flowId, status: "archived" } })
                  .then(() => {
                    toast.success("Arquivado");
                    setMenuOpen(false);
                    qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
                  })
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Erro"))
              }
            >
              <Clock className="h-4 w-4" /> Arquivar
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (confirm(`Excluir "${data.flow.name}"?`)) {
                  setMenuOpen(false);
                  delMut.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Excluir fluxo
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === "completed")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  if (status === "failed")
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (status === "running")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />;
}
