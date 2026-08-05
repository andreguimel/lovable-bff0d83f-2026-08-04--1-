import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBroadcastsReport, exportReportCsv } from "@/lib/reports.functions";
import { downloadCsv } from "@/lib/download-csv";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileReportsBroadcasts } from "@/components/reports/mobile/mobile-reports-broadcasts";

export const Route = createFileRoute("/_authenticated/reports/broadcasts")({
  head: () => ({ meta: [{ title: "Relatório de broadcasts — Zenda" }] }),
  component: BroadcastsReport,
});

function BroadcastsReport() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileReportsBroadcasts />;
  return <DesktopBroadcastsReport />;
}

function DesktopBroadcastsReport() {
  const [days, setDays] = useState<30 | 90 | 180>(90);
  const [exporting, setExporting] = useState(false);
  const { data, isPending } = useQuery({
    queryKey: ["report-broadcasts", days],
    queryFn: () => listBroadcastsReport({ data: { days } }),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await exportReportCsv({ data: { type: "broadcasts", days } });
      downloadCsv(res.filename, res.csv);
      toast.success("CSV exportado");
    } catch (e) {
      toast.error("Falha ao exportar", { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
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
          <div className="grid gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="grid place-items-center py-16 text-center text-sm text-muted-foreground">
            Nenhum broadcast no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Destinatários</TableHead>
                  <TableHead className="text-right">Enviados</TableHead>
                  <TableHead className="text-right">Lidos</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">{r.channel_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.total_recipients ?? 0}</TableCell>
                    <TableCell className="text-right">{r.sent_count ?? 0}</TableCell>
                    <TableCell className="text-right">{r.read_count ?? 0}</TableCell>
                    <TableCell className="text-right">{r.failed_count ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
