import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { importContacts, listContacts } from "@/lib/crm.functions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultTab?: "import" | "export";
}

type FieldKey = "name" | "phone" | "email" | "notes" | "tags" | "ignore";

interface FieldSpec {
  key: FieldKey;
  label: string;
  required?: boolean;
}

const SYSTEM_FIELDS: FieldSpec[] = [
  { key: "name", label: "Nome Completo *", required: true },
  { key: "phone", label: "Telefone *", required: true },
  { key: "email", label: "E-mail *" },
  { key: "notes", label: "Notas" },
  { key: "tags", label: "Tags (separadas por vírgula)" },
  { key: "ignore", label: "Ignorar campo" },
];

export function ImportCsvDialog({ open, onOpenChange, defaultTab = "import" }: Props) {
  const qc = useQueryClient();
  const importFn = useServerFn(importContacts);

  const [activeTab, setActiveTab] = useState<"import" | "export">(defaultTab);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [step, setStep] = useState<"upload" | "map" | "preview" | "result">("upload");
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
    setStep("upload");
    setResult(null);
  };

  const onFile = async (file: File) => {
    reset();
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xls" || ext === "xlsx") {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("Planilha vazia");
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: "" });

        if (jsonData.length === 0) {
          toast.error("O arquivo Excel não possui dados nas linhas.");
          return;
        }

        const h = Object.keys(jsonData[0] ?? {});
        setHeaders(h);
        setRows(jsonData.slice(0, 2000));
        setStep("map");

        // Auto-map por aproximação de nome do cabeçalho
        const guess: Record<string, FieldKey> = {};
        h.forEach((col) => {
          const l = col.toLowerCase().trim();
          if (l.includes("nome") || l === "name") guess[col] = "name";
          else if (l.includes("tel") || l.includes("phone") || l.includes("whats") || l.includes("celular"))
            guess[col] = "phone";
          else if (l.includes("mail")) guess[col] = "email";
          else if (l.includes("tag")) guess[col] = "tags";
          else if (l.includes("nota") || l.includes("obs") || l.includes("note")) guess[col] = "notes";
          else guess[col] = "ignore";
        });
        setMapping(guess);
      } catch (err: any) {
        toast.error("Erro ao processar arquivo Excel: " + (err?.message ?? "Formato inválido"));
      }
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const h = res.meta.fields ?? [];
          setHeaders(h);
          setRows(res.data.slice(0, 2000));
          setStep("map");

          const guess: Record<string, FieldKey> = {};
          h.forEach((col) => {
            const l = col.toLowerCase().trim();
            if (l.includes("nome") || l === "name") guess[col] = "name";
            else if (l.includes("tel") || l.includes("phone") || l.includes("whats") || l.includes("celular"))
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
    }
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
      setStep("result");
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

  const listFn = useServerFn(listContacts);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      toast.info(`Buscando contatos para exportar em ${exportFormat.toUpperCase()}...`);
      const res = await listFn({ data: { page: 1, pageSize: 200 } });
      const contacts = res?.rows ?? [];
      if (!Array.isArray(contacts) || contacts.length === 0) {
        toast.warning("Nenhum contato encontrado para exportar.");
        setExporting(false);
        return;
      }

      const formattedData = contacts.map((r: any) => ({
        Nome: r.name ?? "",
        Empresa: r.company_name ?? "",
        Telefone: r.phone ?? "",
        Email: r.email ?? "",
        Estagio: r.funnel_stage ?? r.stage ?? "",
        Valor: r.deal_value_cents ? Number((r.deal_value_cents / 100).toFixed(2)) : 0,
        Score: r.lead_score ?? "",
        Tags: Array.isArray(r.contact_tags)
          ? r.contact_tags.map((ct: any) => ct.tag?.name).filter(Boolean).join(", ")
          : "",
        "Ultima Interacao": r.last_interaction_at ?? "",
      }));

      const dateStr = new Date().toISOString().slice(0, 10);

      if (exportFormat === "xlsx") {
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
        XLSX.writeFile(workbook, `crm-clientes-${dateStr}.xlsx`);
        toast.success(`${contacts.length} contatos exportados em Excel (.xlsx)!`);
      } else {
        const csv = Papa.unparse(formattedData);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `crm-clientes-${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${contacts.length} contatos exportados em CSV!`);
      }
    } catch (err: any) {
      toast.error("Erro ao exportar contatos: " + (err?.message ?? "Falha no servidor"));
    } finally {
      setExporting(false);
    }
  };

  // Verifica se todos os campos obrigatórios (nome e telefone) foram mapeados
  const mappedValues = Object.values(mapping);
  const isNameMapped = mappedValues.includes("name");
  const isPhoneMapped = mappedValues.includes("phone");
  const allRequiredMapped = isNameMapped && isPhoneMapped;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-3xl md:max-w-4xl w-[94vw] max-h-[92vh] flex flex-col overflow-hidden p-6 rounded-3xl shadow-2xl bg-white border border-gray-100 font-sans">
        {/* Header com Título e Abas */}
        <DialogHeader className="shrink-0 pb-3 border-b border-gray-100">
          <DialogTitle className="text-xl font-bold text-gray-900 tracking-tight mb-3">
            Importar / Exportar Clientes
          </DialogTitle>

          {/* Navegação por Abas (Pill Container) */}
          <div className="bg-gray-100/80 p-1 rounded-2xl flex items-center gap-1 w-full max-w-md">
            <button
              onClick={() => setActiveTab("import")}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all nodrag ${
                activeTab === "import"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Importar
            </button>
            <button
              onClick={() => setActiveTab("export")}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all nodrag ${
                activeTab === "export"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </button>
          </div>
        </DialogHeader>

        {/* Conteúdo Principal Scrollável */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-4">
          {/* ============ ABA IMPORTAR ============ */}
          {activeTab === "import" && (
            <>
              {/* ETAPA 1: UPLOAD */}
              {step === "upload" && (
                <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-12 text-center cursor-pointer hover:bg-blue-50/30 hover:border-blue-300 transition-colors my-4">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-900">Clique para selecionar um arquivo CSV ou Excel</p>
                    <p className="text-xs text-gray-500 mt-1">Suporta arquivos .csv, .xls e .xlsx</p>
                  </div>
                  <input
                    type="file"
                    accept=".csv, .xls, .xlsx, text/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                  />
                </label>
              )}

              {/* ETAPA 2: MAPEAMENTO DE COLUNAS (LAYOUT IDÊNTICO À IMAGEM DO USUÁRIO) */}
              {step === "map" && rows.length > 0 && (
                <div className="space-y-4">
                  {/* Banner Verde de Validação de Campos Obrigatórios */}
                  <div
                    className={`py-2.5 px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors ${
                      allRequiredMapped
                        ? "bg-emerald-50/80 border-emerald-200/80 text-emerald-700"
                        : "bg-amber-50/80 border-amber-200/80 text-amber-800"
                    }`}
                  >
                    {allRequiredMapped ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                        <span>Todos os campos obrigatórios estão mapeados</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Mapeie os campos obrigatórios (Nome e Telefone) para continuar</span>
                      </>
                    )}
                  </div>

                  {/* Tabela de Mapeamento de 3 Colunas */}
                  <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-2xs">
                    <div className="grid grid-cols-12 bg-gray-50/80 py-2.5 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <div className="col-span-5">Coluna do Arquivo</div>
                      <div className="col-span-2 text-center">Mapear Para</div>
                      <div className="col-span-5">Campo do Sistema</div>
                    </div>

                    <div className="divide-y divide-gray-100 max-h-[340px] overflow-y-auto">
                      {headers.map((col) => {
                        const sampleValue = rows[0]?.[col] ?? "";
                        const mappedFieldKey = mapping[col];
                        const matchedSpec = SYSTEM_FIELDS.find((f) => f.key === mappedFieldKey);
                        const isMandatory = matchedSpec?.required ?? false;

                        return (
                          <div key={col} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-gray-50/40 transition-colors">
                            {/* Coluna 1: Nome da Coluna do Arquivo + Preview Exemplo */}
                            <div className="col-span-5 min-w-0 pr-2">
                              <span className="text-xs font-bold text-gray-900 block truncate">{col}</span>
                              <span className="text-[11px] text-gray-400 truncate block mt-0.5 font-normal">
                                {sampleValue ? `Ex: ${sampleValue}` : "Sem valor de exemplo"}
                              </span>
                            </div>

                            {/* Coluna 2: Ícone Seta Azul de Mapeamento */}
                            <div className="col-span-2 flex justify-center">
                              <ArrowRight className="w-4 h-4 text-blue-500 stroke-[2.5]" />
                            </div>

                            {/* Coluna 3: Campo do Sistema + Badge de Obrigatório */}
                            <div className="col-span-5 flex items-center gap-2 pl-2">
                              <div className="flex-1 min-w-0">
                                <Select
                                  value={mapping[col] || "ignore"}
                                  onValueChange={(v) => setMapping((p) => ({ ...p, [col]: v as FieldKey }))}
                                >
                                  <SelectTrigger className="h-9 text-xs font-medium bg-white border-gray-200 rounded-xl focus:ring-blue-500">
                                    <SelectValue placeholder="Ignorar campo" />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl">
                                    {SYSTEM_FIELDS.map((f) => (
                                      <SelectItem key={f.key} value={f.key} className="text-xs font-medium">
                                        {f.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {isMandatory && (
                                <span className="bg-emerald-50 text-emerald-600 border border-emerald-200/80 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                                  Obrigatório
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nota de Rodapé */}
                  <p className="text-[11px] text-gray-400 font-medium pt-1">
                    <span className="text-emerald-600 font-bold">*</span> Campo obrigatório &nbsp;•&nbsp; Campos não mapeados serão ignorados na importação
                  </p>
                </div>
              )}

              {/* ETAPA 3: RESULTADO DA IMPORTAÇÃO */}
              {step === "result" && result && (
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
                      <p className="text-xs text-emerald-700 font-semibold">Criados</p>
                      <p className="text-3xl font-extrabold text-emerald-600 mt-1">{result.created}</p>
                    </div>
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-center">
                      <p className="text-xs text-blue-700 font-semibold">Atualizados</p>
                      <p className="text-3xl font-extrabold text-blue-600 mt-1">{result.updated}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-center">
                      <p className="text-xs text-amber-700 font-semibold">Ignorados</p>
                      <p className="text-3xl font-extrabold text-amber-600 mt-1">{result.skipped}</p>
                    </div>
                  </div>

                  {result.errors.length > 0 ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4 text-xs">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold text-red-900">{result.errors.length} linhas apresentaram erro</p>
                        <Button size="sm" variant="link" className="h-auto p-0 text-red-600 font-semibold mt-1" onClick={downloadErrors}>
                          Baixar relatório de erros (CSV)
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      Importação concluída com sucesso!
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============ ABA EXPORTAR ============ */}
          {activeTab === "export" && (
            <div className="space-y-4 py-4">
              <div className="p-6 rounded-2xl border border-gray-100 bg-gray-50/50 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Exportar Base de Contatos</h3>
                    <p className="text-xs text-gray-500">Faça o download dos seus clientes em planilha Excel ou CSV</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 mr-1">Formato:</span>
                    <button
                      type="button"
                      onClick={() => setExportFormat("xlsx")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        exportFormat === "xlsx"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-gray-200/80 text-gray-700 hover:bg-gray-300/80"
                      }`}
                    >
                      Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat("csv")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        exportFormat === "csv"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-gray-200/80 text-gray-700 hover:bg-gray-300/80"
                      }`}
                    >
                      CSV (.csv)
                    </button>
                  </div>

                  <Button onClick={handleExport} disabled={exporting} className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white">
                    {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Exportar Clientes ({exportFormat.toUpperCase()})
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Navegação Estilizados */}
        <DialogFooter className="shrink-0 pt-3 border-t border-gray-100 flex items-center justify-between">
          {activeTab === "import" && step === "map" ? (
            <>
              <Button
                variant="outline"
                onClick={reset}
                className="rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 border-gray-200 px-4"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Voltar
              </Button>

              <Button
                onClick={() => mut.mutate()}
                disabled={!allRequiredMapped || mut.isPending}
                className="rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                {mut.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importando...
                  </>
                ) : (
                  <>
                    Importar {rows.length > 0 && `(${rows.length})`} <ChevronRight className="ml-1 h-3.5 w-3.5 stroke-[3]" />
                  </>
                )}
              </Button>
            </>
          ) : activeTab === "import" && step === "result" ? (
            <Button onClick={() => onOpenChange(false)} className="rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white px-6">
              Concluído
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs font-semibold">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
