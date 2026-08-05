import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCascadesReport, exportReportCsv } from "@/lib/reports.functions";
import { downloadCsv } from "@/lib/download-csv";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileReportsCascades } from "@/components/reports/mobile/mobile-reports-cascades";

export const Route = createFileRoute("/_authenticated/reports/cascades")({
  head: () => ({ meta: [{ title: "Relatório de cascatas — Zenda" }] }),
  component: CascadesReport,
});

function CascadesReport() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileReportsCascades />;
  return <DesktopCascadesReport />;
}

function DesktopCascadesReport() {
  const [days, setDays] = useState<30 | 90 | 180>(90);
  const [exporting, setExporting] = useState(false);
  const { data, isPending } = useQuery({
    queryKey: ["report-cascades", days],
    queryFn: () => listCascadesReport({ data: { days } }),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await exportReportCsv({ data: { type: "cascades", days } });
      downloadCsv(res.filename, res.csv);
      toast.success("CSV exportado");
    } catch (e) {
      toast.error("Falha ao exportar", { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 30 | 90 | 180)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="180">180 dias</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Exportar CSV
        </Button>
      </div>

      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center py-16 text-center text-sm text-muted-foreground">
            Nenhuma cascata cadastrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((p) => {
            const total = p.total_runs || 0;
            const success = p.delivered + p.read;
            const rate = total > 0 ? Math.round((success / total) * 100) : 0;
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativa" : "Pausada"}</Badge>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Stat label="Total" value={p.total_runs} />
                    <Stat label="Entregues" value={p.delivered + p.read} accent="text-success" />
                    <Stat label="Esgotadas" value={p.exhausted} accent="text-destructive" />
                    <Stat label="Ativas" value={p.running} accent="text-primary" />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Taxa de sucesso</span>
                      <span className="font-semibold text-foreground">{rate}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                  {p.per_step.length > 0 && (
                    <div className="grid gap-1 border-t border-border/60 pt-2">
                      {p.per_step.map((s) => (
                        <div key={s.step} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Passo {s.step} · {s.channel}
                          </span>
                          <span className="font-medium">{s.sent} envios</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className={`font-display text-xl font-bold ${accent ?? ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
