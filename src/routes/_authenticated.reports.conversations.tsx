import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listConversationsReport, exportReportCsv } from "@/lib/reports.functions";
import { downloadCsv } from "@/lib/download-csv";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileReportsConversations } from "@/components/reports/mobile/mobile-reports-conversations";

export const Route = createFileRoute("/_authenticated/reports/conversations")({
  head: () => ({ meta: [{ title: "Relatório de conversas — Zenda" }] }),
  component: ConversationsReport,
});

function ConversationsReport() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileReportsConversations />;
  return <DesktopConversationsReport />;
}

function DesktopConversationsReport() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["report-conversations", days, status, search],
    queryFn: () =>
      listConversationsReport({
        data: {
          days,
          status: status === "all" ? undefined : status,
          search: search || undefined,
        },
      }),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await exportReportCsv({ data: { type: "conversations", days } });
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
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar contato ou mensagem"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="open">Abertas</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="resolved">Resolvidas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30 | 90)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar CSV
          </Button>
        </div>

        {isPending ? (
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma conversa no período.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última msg</TableHead>
                  <TableHead className="text-right">Não lidas</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.contact_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.contact_phone ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.channel_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {r.last_message_preview ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.unread_count}</TableCell>
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
