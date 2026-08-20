import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importContacts } from "@/lib/crm.functions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type FieldKey = "name" | "phone" | "email" | "notes" | "tags" | "ignore";
const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Nome",
  phone: "Telefone",
  email: "Email",
  notes: "Notas",
  tags: "Tags (separadas por vírgula)",
  ignore: "Ignorar",
};

export function ImportCsvDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const importFn = useServerFn(importContacts);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  };

  const onFile = (file: File) => {
    reset();
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const h = res.meta.fields ?? [];
        setHeaders(h);
        setRows(res.data.slice(0, 2000));
        // Auto-map by header name
        const guess: Record<string, FieldKey> = {};
        h.forEach((col) => {
          const l = col.toLowerCase().trim();
          if (l.includes("nome") || l === "name") guess[col] = "name";
          else if (l.includes("tel") || l.includes("phone") || l.includes("whats"))
            guess[col] = "phone";
          else if (l.includes("mail")) guess[col] = "email";
          else if (l.includes("tag")) guess[col] = "tags";
          else if (l.includes("nota") || l.includes("obs") || l.includes("note")) guess[col] = "notes";
          else guess[col] = "ignore";
        });
        setMapping(guess);
      },
      error: (err) => toast.error("Erro ao ler CSV: " + err.message),
    });
  };

  const mut = useMutation({
    mutationFn: async () => {
      const mapped = rows
        .map((r) => {
          const out: Record<string, string> = {};
          for (const [col, field] of Object.entries(mapping)) {
            if (field === "ignore") continue;
            const v = (r[col] ?? "").toString().trim();
            if (v) out[field] = v;
          }
          return out;
        })
        .filter((r) => r.name && r.phone);
      if (mapped.length === 0) throw new Error("Nenhuma linha válida (nome e telefone obrigatórios)");
      return importFn({ data: { rows: mapped as never } });
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadErrors = () => {
    if (!result?.errors.length) return;
    const csv = Papa.unparse(result.errors);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "erros-importacao.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-3xl md:max-w-4xl w-[92vw] max-h-[90vh] flex flex-col overflow-hidden p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="shrink-0 pb-2 border-b border-border/40">
          <DialogTitle className="text-xl font-bold">Importar contatos via CSV</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Faça upload de um arquivo CSV. Mapearemos as colunas para os campos do CRM. Telefones
            duplicados serão atualizados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-4">
          {!result && rows.length === 0 && (
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 p-10 text-center cursor-pointer hover:bg-muted/40 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-semibold">Clique para selecionar um arquivo CSV</p>
              <p className="text-xs text-muted-foreground">Ou arraste até aqui</p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
          )}

          {!result && rows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm bg-muted/40 p-2.5 rounded-lg border border-border/40">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{rows.length} linhas encontradas</span>
                <Button size="sm" variant="ghost" onClick={reset} className="ml-auto text-xs font-semibold">
                  Trocar arquivo
                </Button>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Mapeamento de colunas:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-muted/20">
                  {headers.map((col) => (
                    <div key={col} className="grid gap-1 min-w-0">
                      <Label className="truncate text-xs font-semibold text-foreground" title={col}>
                        {col}
                      </Label>
                      <Select
                        value={mapping[col]}
                        onValueChange={(v) => setMapping((p) => ({ ...p, [col]: v as FieldKey }))}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                            <SelectItem key={k} value={k} className="text-xs">
                              {FIELD_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <p className="text-xs font-semibold text-muted-foreground pt-1">Pré-visualização dos dados:</p>
                <div className="rounded-xl border border-border/60 overflow-x-auto max-h-52 bg-background">
                  <Table className="min-w-[650px] w-full">
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                      <TableRow>
                        {headers.map((h) => (
                          <TableHead key={h} className="text-xs font-bold whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>
                          {headers.map((h) => (
                            <TableCell key={h} className="text-xs max-w-[200px] truncate">
                              {r[h]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground font-semibold">Criados</p>
                  <p className="text-2xl font-bold text-emerald-600">{result.created}</p>
                </div>
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground font-semibold">Atualizados</p>
                  <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground font-semibold">Ignorados</p>
                  <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
                </div>
              </div>
              {result.errors.length > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex-1">
                    <p className="font-semibold">{result.errors.length} linhas com erro</p>
                    <Button size="sm" variant="link" className="h-auto p-0 text-destructive" onClick={downloadErrors}>
                      Baixar linhas com erro (CSV)
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Importação concluída sem erros.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t border-border/40">
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button onClick={() => mut.mutate()} disabled={rows.length === 0 || mut.isPending} className="rounded-xl font-bold">
                {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Importar {rows.length > 0 && `(${rows.length})`}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)} className="rounded-xl font-bold">Concluído</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
