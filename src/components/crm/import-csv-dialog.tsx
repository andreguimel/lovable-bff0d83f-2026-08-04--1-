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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar contatos via CSV</DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo CSV. Mapearemos as colunas para os campos do CRM. Telefones
            duplicados serão atualizados.
          </DialogDescription>
        </DialogHeader>

        {!result && rows.length === 0 && (
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/70 p-8 text-center cursor-pointer hover:bg-muted/50">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Clique para selecionar um arquivo CSV</p>
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
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium">{rows.length} linhas encontradas</span>
              <Button size="sm" variant="ghost" onClick={reset} className="ml-auto">
                Trocar arquivo
              </Button>
            </div>

            <div className="rounded-lg border border-border/60">
              <div className="grid grid-cols-2 gap-3 border-b border-border/60 p-3">
                {headers.map((col) => (
                  <div key={col} className="grid gap-1">
                    <Label className="truncate text-xs">{col}</Label>
                    <Select
                      value={mapping[col]}
                      onValueChange={(v) => setMapping((p) => ({ ...p, [col]: v as FieldKey }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {FIELD_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="max-h-52 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHead key={h} className="text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        {headers.map((h) => (
                          <TableCell key={h} className="text-xs">
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
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xs text-muted-foreground">Criados</p>
                <p className="text-2xl font-bold text-emerald-600">{result.created}</p>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                <p className="text-xs text-muted-foreground">Atualizados</p>
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs text-muted-foreground">Ignorados</p>
                <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
              </div>
            </div>
            {result.errors.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="flex-1">
                  <p className="font-medium">{result.errors.length} linhas com erro</p>
                  <Button size="sm" variant="link" className="h-auto p-0" onClick={downloadErrors}>
                    Baixar linhas com erro (CSV)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Importação concluída sem erros.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => mut.mutate()} disabled={rows.length === 0 || mut.isPending}>
                {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Importar {rows.length > 0 && `(${rows.length})`}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Concluído</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
