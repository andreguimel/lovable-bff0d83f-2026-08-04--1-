import { useQuery } from "@tanstack/react-query";
import { guardianListSnapshots } from "@/lib/guardian.functions";

type Snapshot = {
  id: string;
  score: number;
  status: string;
  created_at: string;
};

/**
 * Sparkline SVG mostrando o score de saúde dos últimos snapshots (cron + manual).
 * Fica silencioso quando ainda não há dados.
 */
export function GuardianHealthSparkline() {
  const q = useQuery({
    queryKey: ["guardian", "snapshots"],
    queryFn: () => guardianListSnapshots({ data: { limit: 48 } }),
    refetchInterval: 60_000,
  });

  const snapshots = (q.data?.snapshots ?? []) as Snapshot[];
  if (snapshots.length < 2) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="guardian-sparkline-empty">
        Coletando histórico de saúde… próximos pontos aparecem após novas varreduras.
      </p>
    );
  }

  const w = 320;
  const h = 48;
  const pad = 4;
  const scores = snapshots.map((s) => s.score);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = Math.max(1, max - min);
  const step = (w - pad * 2) / (snapshots.length - 1);

  const points = snapshots.map((s, i) => {
    const x = pad + i * step;
    const y = h - pad - ((s.score - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = snapshots[snapshots.length - 1];
  const color =
    last.status === "critical" ? "hsl(var(--destructive))" :
    last.status === "warning" ? "hsl(38 92% 50%)" :
    "hsl(142 71% 45%)";

  return (
    <div className="space-y-1" data-testid="guardian-sparkline">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none" role="img" aria-label="Histórico de saúde do Guardião">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          points={points.join(" ")}
        />
      </svg>
      <p className="text-[11px] text-muted-foreground">
        Últimas {snapshots.length} varreduras · score atual {last.score}
      </p>
    </div>
  );
}
