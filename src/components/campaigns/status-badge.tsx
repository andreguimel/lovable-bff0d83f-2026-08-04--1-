import { Badge } from "@/components/ui/badge";

const map: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendada", cls: "bg-info/15 text-info" },
  sending: { label: "Em envio", cls: "bg-success/15 text-success" },
  paused: { label: "Pausada", cls: "bg-warning/15 text-warning" },
  completed: { label: "Concluída", cls: "bg-muted text-muted-foreground" },
  failed: { label: "Falhou", cls: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
};

export function BroadcastStatusBadge({ status }: { status: string }) {
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <Badge className={m.cls}>{m.label}</Badge>;
}
