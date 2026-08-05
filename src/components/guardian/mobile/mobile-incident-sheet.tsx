import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock3,
  MessageSquare,
  Plug,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ClientTime } from "@/components/client-time";
import type {
  GuardianIncident,
  GuardianSeverity,
} from "@/lib/guardian.types";

/**
 * Mobile-native full-screen bottom sheet with severity hero, vertical
 * Linear-style timeline and primary/secondary actions.
 */
export function MobileIncidentSheet({
  incident,
  open,
  onOpenChange,
  onRepair,
  repairing,
}: {
  incident: GuardianIncident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRepair: (incident: GuardianIncident) => void;
  repairing: boolean;
}) {
  const [showPayload, setShowPayload] = useState(false);

  const canRepair =
    !!incident &&
    (incident.repairAction === "resend_message" ||
      incident.repairAction === "retry_flow" ||
      incident.repairAction === "toggle_integration");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] w-full flex-col gap-0 rounded-none border-t-0 p-0 sm:max-w-full"
      >
        {incident ? (
          <>
            {/* Hero */}
            <div
              className={`shrink-0 border-b border-border/50 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 ${severityHeroBg(
                incident.severity,
              )}`}
            >
              <SheetHeader className="space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${severityIconBg(
                      incident.severity,
                    )}`}
                  >
                    <KindIcon
                      kind={incident.kind}
                      className={`h-4 w-4 ${severityIconColor(
                        incident.severity,
                      )}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <SeverityBadge severity={incident.severity} />
                    <SheetTitle className="mt-1 line-clamp-3 text-lg font-bold leading-snug">
                      {incident.title}
                    </SheetTitle>
                  </div>
                </div>
                <SheetDescription className="sr-only">
                  Detalhes do incidente
                </SheetDescription>
                {incident.detectedAt && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock3 className="h-3 w-3" /> Detectado{" "}
                    <ClientTime iso={incident.detectedAt} />
                  </p>
                )}
              </SheetHeader>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-4">
              {incident.impact && (
                <Block label="Impacto">{incident.impact}</Block>
              )}

              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Timeline
                </p>
                <ol className="relative ml-2 border-l-2 border-border/60">
                  <TimelineItem
                    icon={AlertTriangle}
                    tone="danger"
                    title="Incidente detectado"
                    subtitle={
                      incident.detectedAt ? (
                        <ClientTime iso={incident.detectedAt} />
                      ) : (
                        "Momento desconhecido"
                      )
                    }
                  />
                  {incident.probableCause && (
                    <TimelineItem
                      icon={Sparkles}
                      tone="warning"
                      title="Causa provável"
                      subtitle={incident.probableCause}
                    />
                  )}
                  {incident.recommendedAction && (
                    <TimelineItem
                      icon={ShieldCheck}
                      tone="primary"
                      title="Ação recomendada"
                      subtitle={incident.recommendedAction}
                    />
                  )}
                  <TimelineItem
                    icon={Clock3}
                    tone="muted"
                    title={statusLabel(incident.status)}
                    subtitle="Estado atual"
                    last
                  />
                </ol>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowPayload((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-xs font-medium"
                >
                  <span>Payload técnico</span>
                  {showPayload ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showPayload && (
                  <pre className="mt-2 max-h-[40vh] overflow-auto rounded-xl border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed">
                    {JSON.stringify(incident.payload, null, 2)}
                  </pre>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="shrink-0 border-t border-border/50 bg-background/95 px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
              <div className="flex items-center gap-2">
                {canRepair && (
                  <Button
                    onClick={() => onRepair(incident)}
                    disabled={repairing}
                    className="h-11 flex-1 rounded-xl"
                  >
                    {repairing ? "Aplicando…" : repairLabel(incident)}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="h-11 rounded-xl"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  tone,
  title,
  subtitle,
  last,
}: {
  icon: typeof Clock3;
  tone: "danger" | "warning" | "primary" | "muted";
  title: string;
  subtitle: React.ReactNode;
  last?: boolean;
}) {
  const toneMap = {
    danger: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
    warning: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
    primary: "bg-primary/15 text-primary ring-primary/30",
    muted: "bg-muted text-muted-foreground ring-border",
  }[tone];
  return (
    <li className={`relative pl-6 ${last ? "" : "pb-5"}`}>
      <span
        className={`absolute -left-[13px] top-0 grid h-6 w-6 place-items-center rounded-full ring-2 ${toneMap} ring-background`}
      >
        <Icon className="h-3 w-3" />
      </span>
      <p className="text-sm font-semibold leading-tight">{title}</p>
      <div className="mt-0.5 text-[12px] text-muted-foreground">
        {subtitle}
      </div>
    </li>
  );
}

function KindIcon({
  kind,
  className,
}: {
  kind: GuardianIncident["kind"];
  className?: string;
}) {
  const map = {
    message: MessageSquare,
    flow: Workflow,
    channel: Webhook,
    integration: Plug,
    broadcast: Send,
    cascade: Zap,
  } as const;
  const Icon = map[kind] ?? ShieldAlert;
  return <Icon className={className} />;
}

function SeverityBadge({ severity }: { severity: GuardianSeverity }) {
  const cfg =
    severity === "critical"
      ? {
          label: "Crítico",
          cls: "bg-rose-500/15 text-rose-500",
          Icon: AlertTriangle,
        }
      : severity === "warning"
        ? {
            label: "Atenção",
            cls: "bg-amber-500/15 text-amber-500",
            Icon: ShieldAlert,
          }
        : {
            label: "Saudável",
            cls: "bg-emerald-500/15 text-emerald-500",
            Icon: ShieldCheck,
          };
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cfg.cls}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    open: "Aberto",
    investigating: "Investigando",
    resolved: "Resolvido",
    ignored: "Ignorado",
    acknowledged: "Reconhecido",
  };
  return map[status] ?? status;
}

function repairLabel(incident: GuardianIncident) {
  switch (incident.repairAction) {
    case "resend_message":
      return "Reenviar mensagem";
    case "retry_flow":
      return "Retentar fluxo";
    case "toggle_integration":
      return "Alternar integração";
    default:
      return "Inspecionar";
  }
}

function severityHeroBg(s: GuardianSeverity) {
  return s === "critical"
    ? "bg-gradient-to-b from-rose-500/10 to-transparent"
    : s === "warning"
      ? "bg-gradient-to-b from-amber-500/10 to-transparent"
      : "bg-gradient-to-b from-emerald-500/10 to-transparent";
}
function severityIconBg(s: GuardianSeverity) {
  return s === "critical"
    ? "bg-rose-500/15"
    : s === "warning"
      ? "bg-amber-500/15"
      : "bg-emerald-500/15";
}
function severityIconColor(s: GuardianSeverity) {
  return s === "critical"
    ? "text-rose-500"
    : s === "warning"
      ? "text-amber-500"
      : "text-emerald-500";
}
