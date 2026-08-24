import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  Loader2,
  MoreVertical,
  Search,
  Trash2,
  Copy,
  Plus,
  Star,
  StarOff,
  Play,
  Pause,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  createFlow,
  createFlowFromTemplate,
  deleteFlow,
  duplicateFlow,
  listFlows,
  listFlowTemplates,
  setFlowStatus,
  toggleFlowTemplate,
} from "@/lib/flows.functions";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFlowsHome } from "@/components/flows/mobile/mobile-flows-home";

function getStatusBadge(status?: string) {
  if (status === "published" || status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Publicado
      </span>
    );
  }
  if (status === "archived") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Arquivado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Rascunho
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/flows/")({
  head: () => ({
    meta: [
      { title: "Fluxos de conversa" },
      {
        name: "description",
        content: "Gerencie e crie fluxos de conversa automatizados.",
      },
    ],
  }),
  component: FlowsRoute,
});

function FlowsRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileFlowsHome /> : <FlowsHomeBotconversa />;
}

function FlowsHomeBotconversa() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(listFlows);
  const createFn = useServerFn(createFlow);
  const listTplFn = useServerFn(listFlowTemplates);
  const createFromTplFn = useServerFn(createFlowFromTemplate);
  const deleteFn = useServerFn(deleteFlow);
  const dupFn = useServerFn(duplicateFlow);
  const toggleTplFn = useServerFn(toggleFlowTemplate);
  const setStatusFn = useServerFn(setFlowStatus);

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["flows-list"],
    queryFn: () => fn(),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["flow-templates"],
    queryFn: () => listTplFn(),
  });

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectExistingOpen, setSelectExistingOpen] = useState(false);
  const [existingSearch, setExistingSearch] = useState("");
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const filteredExistingFlows = useMemo(() => {
    if (!existingSearch.trim()) return flows;
    const term = existingSearch.toLowerCase();
    return flows.filter((f: any) => f.name.toLowerCase().includes(term));
  }, [flows, existingSearch]);

  const createMut = useMutation({
    mutationFn: async () => {
      return createFn({ data: { name: name.trim(), triggerType: "manual" } });
    },
    onSuccess: ({ id }) => {
      toast.success("Fluxo criado com sucesso.");
      setPopoverOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
      navigate({ to: "/flows/$flowId", params: { flowId: id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar fluxo"),
  });

  const createFromTplMut = useMutation({
    mutationFn: async (tpl: { slug: string; name: string }) => {
      return createFromTplFn({
        data: { slug: tpl.slug, name: `${tpl.name}` },
      });
    },
    onSuccess: ({ id }) => {
      toast.success("Fluxo criado a partir do modelo.");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
      navigate({ to: "/flows/$flowId", params: { flowId: id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar fluxo do modelo"),
  });

  const toggleTplMut = useMutation({
    mutationFn: ({ flowId, isTemplate }: { flowId: string; isTemplate: boolean }) =>
      toggleTplFn({ data: { flowId, isTemplate } }),
    onSuccess: (res) => {
      toast.success(res.isTemplate ? "Fluxo definido como modelo padrão!" : "Removido dos modelos padrões.");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
      qc.invalidateQueries({ queryKey: ["flow-templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao alterar modelo"),
  });

  const statusMut = useMutation({
    mutationFn: ({ flowId, status }: { flowId: string; status: "active" | "draft" | "archived" }) =>
      setStatusFn({ data: { flowId, status } }),
    onSuccess: (_, vars) => {
      const msg = vars.status === "active" ? "Fluxo publicado com sucesso!" : vars.status === "draft" ? "Fluxo alterado para Rascunho." : "Fluxo arquivado.";
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao alterar status"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { flowId: id } }),
    onSuccess: () => {
      toast.success("Fluxo excluído.");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => dupFn({ data: { flowId: id } }),
    onSuccess: () => {
      toast.success("Fluxo duplicado.");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao duplicar"),
  });

  const filtered = useMemo(() => {
    return flows.filter((f: any) => {
      if (q.trim() && !f.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (statusFilter === "published" && f.status !== "published" && f.status !== "active") return false;
      if (statusFilter === "draft" && f.status !== "draft" && f.status != null) return false;
      return true;
    });
  }, [flows, q, statusFilter]);

  const publishedCount = useMemo(() => flows.filter((f: any) => f.status === "published" || f.status === "active").length, [flows]);
  const draftCount = useMemo(() => flows.filter((f: any) => f.status === "draft" || !f.status).length, [flows]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header com Título e Botão de Criar Fluxo */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Fluxos de conversa</h1>

        <div className="flex items-center gap-3">
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full px-6 py-5 shadow-lg shadow-blue-500/25 text-sm transition-all hover:scale-[1.02]">
                Criar Novo Fluxo +
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4 space-y-3 shadow-2xl rounded-2xl border-gray-100">
              <h3 className="font-semibold text-sm text-gray-800">Nome do novo fluxo</h3>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Qualificação de Leads Vendas"
                className="text-xs h-10 rounded-xl"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) createMut.mutate();
                }}
              />
              <Button
                disabled={!name.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xs py-2.5 rounded-xl shadow-sm"
              >
                {createMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Criar Novo Fluxo"
                )}
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Seção: Modelos de Fluxos Padrões estilo BotConversa */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
            <span>Fluxos Padrões Básicos</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
          {templates.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              {showAllTemplates ? "Mostrar menos" : "Ver todos os modelos"}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllTemplates ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {/* Botões de Ação estilo BotConversa: [ Selecionar existente ] | [ Criar novo ] */}
        <div className="flex items-center gap-2">
          {/* Botão Selecionar existente */}
          <Popover open={selectExistingOpen} onOpenChange={setSelectExistingOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="py-2.5 px-4 border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-100/60 text-blue-600 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <span>Selecionar existente</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2.5 bg-white rounded-2xl shadow-2xl border border-gray-100 space-y-2 z-50">
              <div className="relative">
                <Input
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  placeholder="Busca"
                  className="h-8.5 pl-3 pr-8 bg-gray-50 border-gray-200 text-xs rounded-xl"
                  autoFocus
                />
                <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-2.5" />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-0.5 text-xs pt-1">
                {filteredExistingFlows.length === 0 ? (
                  <div className="p-3 text-center text-gray-400 text-xs">Nenhum fluxo encontrado</div>
                ) : (
                  filteredExistingFlows.map((f: any) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        toggleTplMut.mutate({ flowId: f.id, isTemplate: true });
                        setSelectExistingOpen(false);
                        navigate({ to: "/flows/$flowId", params: { flowId: f.id } });
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 text-gray-800 hover:text-blue-900 font-bold uppercase transition-colors truncate block"
                    >
                      {f.name}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Botão Criar novo */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="py-2.5 px-4 border-2 border-dashed border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <span>Criar novo</span>
              </button>
            </PopoverTrigger>
          </Popover>
        </div>

        {/* Cards de Modelos */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3.5 pt-1">
          {(showAllTemplates ? templates : templates.slice(0, 4)).map((tpl: any) => (
            <div
              key={tpl.slug}
              onClick={() => createFromTplMut.mutate(tpl)}
              className="p-3.5 bg-white hover:bg-blue-50/40 rounded-2xl border-2 border-dashed border-blue-200 hover:border-blue-400 flex flex-col justify-between cursor-pointer transition-all shadow-sm group min-h-[95px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${tpl.isCustom ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                    {tpl.isCustom ? "Modelo da Empresa" : "Modelo Padrão"}
                  </span>
                  <p className="text-xs font-bold text-gray-800 group-hover:text-blue-600 transition-colors pt-0.5">
                    {tpl.name}
                  </p>
                </div>
                {createFromTplMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                ) : (
                  <Plus className="w-4 h-4 text-blue-500 opacity-60 group-hover:opacity-100 shrink-0" />
                )}
              </div>
              {tpl.description && (
                <p className="text-[10px] text-gray-400 line-clamp-1 mt-1 font-normal">
                  {tpl.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Seção: Todos os Fluxos */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-gray-800">Todos os Fluxos</h2>

            {/* Filtros de Status */}
            <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === "all" ? "bg-white text-gray-900 shadow-xs font-bold" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Todos ({flows.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("published")}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  statusFilter === "published" ? "bg-white text-emerald-800 shadow-xs font-bold" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Publicados ({publishedCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("draft")}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  statusFilter === "draft" ? "bg-white text-amber-800 shadow-xs font-bold" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Rascunhos ({draftCount})
              </button>
            </div>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-64">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca por nome"
              className="h-9 pl-3 pr-8 bg-gray-100/70 border-none rounded-lg text-xs placeholder:text-gray-400 focus:ring-1 focus:ring-blue-400"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-2.5" />
          </div>
        </div>

        {/* Tabela Real de Fluxos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/40 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </th>
                <th className="py-3 px-4 font-normal text-gray-500">Nome</th>
                <th className="py-3 px-4 font-normal text-gray-500 text-center">Status</th>
                <th className="py-3 px-4 font-normal text-gray-500 text-center">Conexões</th>
                <th className="py-3 px-4 font-normal text-gray-500 text-center">Execuções</th>
                <th className="py-3 px-4 font-normal text-gray-500 text-center">CTR, %</th>
                <th className="py-3 px-4 font-normal text-gray-500 text-center">Última alteração</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50 text-xs text-gray-700 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Carregando fluxos...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    Nenhum fluxo encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((f: any) => {
                  const updatedDate = f.updated_at
                    ? new Date(f.updated_at).toLocaleDateString("pt-BR")
                    : "-";

                  return (
                    <tr
                      key={f.id}
                      className="hover:bg-gray-50/60 transition-colors group cursor-pointer"
                      onClick={() => navigate({ to: "/flows/$flowId", params: { flowId: f.id } })}
                    >
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                        <div className="flex items-center gap-2">
                          <span>{f.name}</span>
                          {f.isTemplate && (
                            <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 fill-amber-600" /> Modelo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {getStatusBadge(f.status)}
                      </td>
                      <td className="py-3.5 px-4 text-center text-gray-400">-</td>
                      <td className="py-3.5 px-4 text-center text-gray-400">
                        {f.runs_count > 0 ? f.runs_count : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-center text-gray-400">
                        {f.success_rate != null ? `${f.success_rate}%` : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-center text-gray-500">{updatedDate}</td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {f.status === "published" || f.status === "active" ? (
                              <DropdownMenuItem onClick={() => statusMut.mutate({ flowId: f.id, status: "draft" })}>
                                <Pause className="w-3.5 h-3.5 mr-2 text-amber-600" /> Mudar para Rascunho
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => statusMut.mutate({ flowId: f.id, status: "active" })}>
                                <Play className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Publicar Fluxo
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => toggleTplMut.mutate({ flowId: f.id, isTemplate: !f.isTemplate })}
                            >
                              {f.isTemplate ? (
                                <>
                                  <StarOff className="w-3.5 h-3.5 mr-2 text-amber-600" />
                                  Remover dos Modelos
                                </>
                              ) : (
                                <>
                                  <Star className="w-3.5 h-3.5 mr-2 text-amber-500 fill-amber-500" />
                                  Marcar como Modelo Padrão
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => dupMut.mutate(f.id)}>
                              <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setToDelete({ id: f.id, name: f.name })}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o fluxo &quot;{toDelete?.name}&quot;? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMut.mutate(toDelete.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
