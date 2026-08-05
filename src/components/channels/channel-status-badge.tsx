import { cn } from "@/lib/utils";

const meta: Record<string, { label: string; dot: string; text: string }> = {
  connected: { label: "Conectado", dot: "bg-success", text: "text-success" },
  connecting: { label: "Conectando", dot: "bg-warning animate-pulse", text: "text-warning" },
  disconnected: { label: "Offline", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

export function ChannelStatusBadge({ status, paused }: { status: string; paused?: boolean }) {
  const s = paused ? { label: "Pausado", dot: "bg-warning", text: "text-warning" } : meta[status] ?? meta.disconnected;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", s.text)}>
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
