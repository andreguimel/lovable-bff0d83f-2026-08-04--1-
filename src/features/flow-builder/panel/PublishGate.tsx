/**
 * FB-07 — Diálogo de publicação segura.
 *
 * Fluxo:
 *   - Se há erros: publicação BLOQUEADA. Mostra a lista com navegação.
 *   - Se há apenas avisos: mostra resumo e exige confirmação explícita.
 *   - Se está limpo: confirma rapidamente e publica.
 *
 * Ao concluir com sucesso, exibe um relatório de publicação com
 * data/hora, versão, quantidade de blocos e ocorrências (arquitetura
 * preparada para "responsável" — sem novo login).
 */
import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useBuilderStore } from "../state/store";
import { useFlowHealth, type FlowIssue, type IssueSeverity } from "../validation";
import type { GraphContext } from "../validation";

interface Props {
  ctx: GraphContext;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  publishing: boolean;
}

export function PublishGate({ ctx, open, onClose, onConfirm, publishing }: Props) {
  const report = useFlowHealth(ctx);
  const rf = useReactFlow();
  const selectNode = useBuilderStore((s) => s.selectNode);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [lastPublished, setLastPublished] = useState<{
    at: number;
    nodeCount: number;
    edgeCount: number;
    warnings: number;
    infos: number;
    score: number;
  } | null>(null);

  useEffect(() => {
    if (!open) setAckWarnings(false);
  }, [open]);

  const focusIssue = (issue: FlowIssue) => {
    if (!issue.nodeId) return;
    const node = useBuilderStore.getState().nodesById[issue.nodeId];
    if (!node) return;
    onClose();
    selectNode(issue.nodeId);
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

  const canPublish =
    report.canPublish && (report.warnings.length === 0 || ackWarnings);

  const state: "blocked" | "warnings" | "ready" | "published" = lastPublished
    ? "published"
    : report.errors.length > 0
      ? "blocked"
      : report.warnings.length > 0
        ? "warnings"
        : "ready";

  const handleConfirm = async () => {
    await onConfirm();
    setLastPublished({
      at: Date.now(),
      nodeCount: report.metrics.nodeCount,
      edgeCount: report.metrics.edgeCount,
      warnings: report.warnings.length,
      infos: report.infos.length,
      score: report.score,
    });
  };

  const handleClose = () => {
    setLastPublished(null);
    onClose();
  };

  const combined = useMemo<FlowIssue[]>(
    () => [...report.errors, ...report.warnings, ...report.infos],
    [report],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : handleClose())}>
      <DialogContent className="max-w-lg">
        {state === "published" && lastPublished ? (
          <PublishedReport report={lastPublished} onClose={handleClose} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {state === "blocked" ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    Publicação bloqueada
                  </>
                ) : state === "warnings" ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Publicar com avisos?
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    Fluxo pronto para publicar
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {state === "blocked"
                  ? "Corrija os itens abaixo para poder publicar. Clique em cada um para abrir o bloco correspondente."
                  : state === "warnings"
                    ? "O fluxo pode ser publicado, mas existem pontos que merecem revisão."
                    : "Nenhum problema encontrado. Você pode publicar agora."}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Blocos: <b>{report.metrics.nodeCount}</b></span>
                <span>Conexões: <b>{report.metrics.edgeCount}</b></span>
                <span>Qualidade: <b>{report.score}/100</b></span>
                <span className="text-red-500">Erros: {report.errors.length}</span>
                <span className="text-amber-500">Avisos: {report.warnings.length}</span>
                <span className="text-sky-500">Dicas: {report.infos.length}</span>
              </div>
            </div>

            {combined.length > 0 && (
              <ScrollArea className="max-h-64 rounded-md border">
                <ul className="divide-y">
                  {combined.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => focusIssue(issue)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/60"
                        disabled={!issue.nodeId}
                      >
                        <IssueIcon severity={issue.severity} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium leading-tight">
                            {issue.title}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {issue.detail}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}

            {state === "warnings" && (
              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={ackWarnings}
                  onChange={(e) => setAckWarnings(e.target.checked)}
                />
                Estou ciente dos avisos e quero publicar mesmo assim.
              </label>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} disabled={publishing}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canPublish || publishing}
                className="gap-2"
              >
                <Rocket className="h-4 w-4" />
                {publishing ? "Publicando…" : "Publicar agora"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PublishedReport({
  report,
  onClose,
}: {
  report: {
    at: number;
    nodeCount: number;
    edgeCount: number;
    warnings: number;
    infos: number;
    score: number;
  };
  onClose: () => void;
}) {
  const when = new Date(report.at);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Publicação concluída
        </DialogTitle>
        <DialogDescription>
          Registro da publicação executada agora. Guarde para auditoria.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/40 p-3 text-xs">
        <ReportRow label="Data e hora" value={when.toLocaleString("pt-BR")} />
        <ReportRow label="Qualidade" value={`${report.score}/100`} />
        <ReportRow label="Blocos" value={String(report.nodeCount)} />
        <ReportRow label="Conexões" value={String(report.edgeCount)} />
        <ReportRow label="Avisos" value={String(report.warnings)} />
        <ReportRow label="Dicas" value={String(report.infos)} />
        <ReportRow label="Erros" value="0" />
        <ReportRow label="Responsável" value="Usuário atual" />
      </dl>
      <DialogFooter>
        <Button onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function IssueIcon({ severity }: { severity: IssueSeverity }) {
  if (severity === "error")
    return <AlertCircle className={cn("mt-0.5 h-4 w-4 shrink-0 text-red-500")} />;
  if (severity === "warning")
    return <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0 text-amber-500")} />;
  return <Info className={cn("mt-0.5 h-4 w-4 shrink-0 text-sky-500")} />;
}
