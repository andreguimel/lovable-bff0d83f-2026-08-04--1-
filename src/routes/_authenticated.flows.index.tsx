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
} from "@/lib/flows.functions";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFlowsHome } from "@/components/flows/mobile/mobile-flows-home";

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

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["flows-list"],
    queryFn: () => fn(),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["flow-templates"],
    queryFn: () => listTplFn(),
  });

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

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
    return flows.filter((f) => {
      if (q && !f.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [flows, q]);

  return (
    <div className="min-h-screen bg-gray-50/40 p-6 md:p-8 font-sans space-y-8">
      {/* Header Botconversa */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Fluxos de conversa</h1>

        <div className="flex items-center gap-3">
          {/* Popover de Criação de Fluxo Estilo Botconversa */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md transition-all">
                Criar Novo Fluxo +
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-80 p-4 bg-white rounded-2xl shadow-xl border border-gray-100 space-y-3"
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) {
                    createMut.mutate();
                  }
                }}
                className="h-11 bg-gray-50 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />

              <Button
                onClick={() => createMut.mutate()}
                disabled={!name.trim() || createMut.isPending}
                className="w-full h-11 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors"
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

      {/* Seção: Modelos de Fluxos Padrões */}
      {templates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1 text-sm font-semibold text-gray-700">
            <span>Fluxos Padrões Básicos</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.slice(0, 3).map((tpl) => (
              <div
                key={tpl.slug}
                onClick={() => createFromTplMut.mutate(tpl)}
                className="p-4 bg-white hover:bg-blue-50/30 rounded-2xl border-2 border-dashed border-blue-200 flex items-center justify-between cursor-pointer transition-colors group"
              >
                <div>
                  <p className="text-[11px] font-medium text-blue-500">Modelo Padrão</p>
                  <p className="text-sm font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                    {tpl.name}
                  </p>
                </div>
                {createFromTplMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                ) : (
                  <Plus className="w-4 h-4 text-blue-500 opacity-60 group-hover:opacity-100" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seção: Todos os Fluxos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800">Todos os Fluxos</h2>

          {/* Campo de Busca */}
          <div className="relative w-64">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca"
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
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Carregando fluxos...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Nenhum fluxo encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((f) => {
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
                        {f.name}
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
                          <DropdownMenuContent align="end" className="w-36">
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

      {/* Modal de Exclusão */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" e todas as suas configurações serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMut.mutate(toDelete.id)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
