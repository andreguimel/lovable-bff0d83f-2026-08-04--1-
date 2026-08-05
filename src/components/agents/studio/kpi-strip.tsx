import { useQuery } from "@tanstack/react-query";
import { getAgentDashboard } from "@/lib/agent-studio.functions";

export function KpiStrip({ agentId }: { agentId: string }) {
  const { data } = useQuery({
    queryKey: ["agent-dashboard", agentId],
    queryFn: () => getAgentDashboard({ data: { id: agentId } }),
    staleTime: 30_000,
  });

  const items: { label: string; value: string }[] = [
    { label: "Conversas hoje", value: String(data?.conversationsToday ?? "—") },
    { label: "Totais", value: String(data?.conversationsTotal ?? "—") },
    { label: "Latência média", value: data?.avgLatencyMs ? `${data.avgLatencyMs}ms` : "—" },
    { label: "Erros (7d)", value: String(data?.errors ?? "—") },
    { label: "Tokens (7d)", value: data ? formatNumber(data.tokens) : "—" },
    { label: "Custo est.", value: data ? `$ ${data.estimatedCost}` : "—" },
    { label: "Conversão", value: "—" },
    { label: "Satisfação", value: "—" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
      {items.map((k) => (
        <div key={k.label} className="studio-kpi">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {k.label}
          </p>
          <p className="font-display text-lg font-semibold">{k.value}</p>
        </div>
      ))}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
