/**
 * FB-07 — Painel "Saúde do Fluxo".
 *
 * Copiloto pré-voo: mostra ao usuário se o fluxo está pronto para
 * produção, agrupa ocorrências por severidade e oferece navegação em
 * um clique até o bloco problemático (centraliza o canvas, seleciona
 * e abre o SmartSidebar).
 *
 * Sem workarounds — usa a API pública da store e o React Flow já
 * disponível dentro do FlowStudioV2.
 */
import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useBuilderStore } from "../state/store";
import { useFlowHealth, type FlowIssue, type IssueSeverity } from "../validation";
import type { GraphContext } from "../validation";

interface Props {
  ctx: GraphContext;
  open: boolean;
  onClose: () => void;
}

export function HealthPanel({ ctx, open, onClose }: Props) {
  const report = useFlowHealth(ctx);
  const rf = useReactFlow();
  const selectNode = useBuilderStore((s) => s.selectNode);
  const [tab, setTab] = useState<IssueSeverity | "all">("all");

  const list = useMemo<FlowIssue[]>(() => {
    if (tab === "all") return [...report.errors, ...report.warnings, ...report.infos];
    if (tab === "error") return report.errors;
    if (tab === "warning") return report.warnings;
    return report.infos;
  }, [report, tab]);

  const focusIssue = (issue: FlowIssue) => {
    if (!issue.nodeId) return;
    const node = useBuilderStore.getState().nodesById[issue.nodeId];
    if (!node) return;
    selectNode(issue.nodeId);
    // pequeno delay para o RF já reconhecer a seleção nova
    requestAnimationFrame(() => {
      try {
        rf.setCenter(node.position.x + 120, node.position.y + 60, {
          zoom: Math.max(rf.getZoom(), 1),
          duration: 350,
        });
      } catch {
        /* noop */
      }
    });
  };

  if (!open) return null;

  const scoreColor =
    report.score >= 90
      ? "text-emerald-500"
      : report.score >= 60
        ? "text-amber-500"
        : "text-red-500";

  return (
    <aside
      className="absolute right-3 top-3 z-30 flex w-[360px] max-w-[92vw] flex-col rounded-xl border bg-background/95 shadow-xl backdrop-blur"
      style={{ maxHeight: "calc(100% - 24px)" }}
      aria-label="Saúde do fluxo"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 text-sm font-semibold">Saúde do fluxo</div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid grid-cols-4 gap-2 border-b px-3 py-3">
        <div className="col-span-1 flex flex-col items-start">
          <div className={cn("text-2xl font-bold leading-none", scoreColor)}>
            {report.score}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Qualidade
          </div>
        </div>
        <SummaryTile
          label="Erros"
          count={report.errors.length}
          tone="error"
          active={tab === "error"}
          onClick={() => setTab(tab === "error" ? "all" : "error")}
        />
        <SummaryTile
          label="Avisos"
          count={report.warnings.length}
          tone="warning"
          active={tab === "warning"}
          onClick={() => setTab(tab === "warning" ? "all" : "warning")}
        />
        <SummaryTile
          label="Dicas"
          count={report.infos.length}
          tone="info"
          active={tab === "info"}
          onClick={() => setTab(tab === "info" ? "all" : "info")}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <div>
          {report.metrics.nodeCount} blocos · {report.metrics.edgeCount} conexões
        </div>
        {report.canPublish ? (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-500">
            <CheckCircle2 className="h-3 w-3" /> Pronto
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-red-500">
            <AlertCircle className="h-3 w-3" /> Bloqueado
          </span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {list.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
            Nada por aqui. O fluxo está pronto para publicar.
          </div>
        ) : (
          <ul className="divide-y">
            {list.map((issue) => (
              <li key={issue.id}>
                <button
                  type="button"
                  onClick={() => focusIssue(issue)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-muted/60",
                    issue.nodeId ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <IssueIcon severity={issue.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium leading-tight">
                      {issue.title}
                    </div>
                    <div className="mt-0.5 line-clamp-3 text-[11px] text-muted-foreground">
                      {issue.detail}
                    </div>
                  </div>
                  {issue.nodeId ? (
                    <ChevronRight className="mt-0.5 h-3 w-3 text-muted-foreground" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}

function SummaryTile({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: IssueSeverity;
  active: boolean;
  onClick: () => void;
}) {
  const toneColor =
    tone === "error"
      ? "text-red-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-sky-500";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "col-span-1 flex flex-col items-start rounded-md border px-2 py-1 text-left transition",
        active ? "border-primary bg-primary/5" : "border-transparent hover:border-border",
      )}
    >
      <span className={cn("text-lg font-semibold leading-none", toneColor)}>
        {count}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </button>
  );
}

function IssueIcon({ severity }: { severity: IssueSeverity }) {
  if (severity === "error")
    return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />;
  if (severity === "warning")
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />;
}

/** Botão flutuante de acesso ao painel + badge com contagem de erros. */
export function HealthFab({
  ctx,
  onOpen,
}: {
  ctx: GraphContext;
  onOpen: () => void;
}) {
  const report = useFlowHealth(ctx);
  const tone =
    report.errors.length > 0
      ? "bg-red-500 text-white"
      : report.warnings.length > 0
        ? "bg-amber-500 text-white"
        : "bg-emerald-500 text-white";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur hover:bg-background"
      aria-label="Abrir painel de saúde do fluxo"
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      Saúde
      <Badge className={cn("px-1.5 py-0 text-[10px]", tone)}>{report.score}</Badge>
    </button>
  );
}
