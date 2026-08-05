import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Clock, CheckCircle2, TrendingUp } from "lucide-react";

export function OverviewTab({ data }: { data: any }) {
  const conv = data.conversations ?? [];
  const stats = [
    { label: "Conversas abertas", value: conv.filter((c: any) => c.status === "open").length, icon: MessageCircle, color: "text-sky-500" },
    { label: "Resolvidas", value: conv.filter((c: any) => c.status === "closed" || c.status === "resolved").length, icon: CheckCircle2, color: "text-emerald-500" },
    { label: "Tempo médio", value: "1m 42s", icon: Clock, color: "text-amber-500" },
    { label: "Score", value: 82, icon: TrendingUp, color: "text-primary" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="studio-kpi">
            <div className="flex items-center gap-2">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className="text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-2">Sobre</h3>
          <p className="text-sm text-muted-foreground">{data.extension?.bio ?? "Nenhuma bio cadastrada."}</p>
        </CardContent>
      </Card>
    </div>
  );
}
