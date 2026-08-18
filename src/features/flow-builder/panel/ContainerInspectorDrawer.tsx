import { useState } from "react";
import {
  X,
  Bold,
  Italic,
  AlignLeft,
  Code,
  Type,
  Image as ImageIcon,
  Video,
  FileText,
  Volume2,
  Bookmark,
  Clock,
  PowerOff,
  User,
  Plus,
  Trash2,
  Zap,
  Info,
  ChevronRight,
  GripVertical,
  Copy,
  LayoutGrid,
  Search,
} from "lucide-react";
import { useBuilderStore } from "../state/store";
import type { ContainerSubItem, ContainerActionItem } from "../canvas/ContainerBlockNode";
import { toast } from "sonner";

export function ContainerInspectorDrawer() {
  const selectedNodeId = useBuilderStore((s) => s.selection.nodeIds[0]);
  const node = useBuilderStore((s) => (selectedNodeId ? s.nodesById[selectedNodeId] : null));
  const updateNodeData = useBuilderStore((s) => s.updateNodeData);
  const clearSelection = useBuilderStore((s) => s.clearSelection);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeSaveConfigId, setActiveSaveConfigId] = useState<string | null>(null);
  const [actionSearch, setActionSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const addNode = useBuilderStore((s) => s.addNode);
  const connect = useBuilderStore((s) => s.connect);
  const selectNode = useBuilderStore((s) => s.selectNode);

  if (!node) return null;

  const kind = node.kind;
  const data = node.data || {};

  // Bloco Inicial
  if (kind === "start") {
    return (
      <div className="absolute top-0 left-0 bottom-0 z-30 w-80 bg-white border-r border-gray-200 shadow-2xl flex flex-col font-sans animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-blue-50/50">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <h2 className="text-base font-semibold text-gray-800">Bloco Inicial</h2>
          </div>
          <button
            onClick={() => clearSelection()}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
            Selecione qual bloco conectar ao <b>Bloco Inicial</b> para começar a automação:
          </p>

          <div className="space-y-1.5">
            {[
              { kind: "message", label: "Conteúdo", icon: Type, color: "#EF4444", bg: "#FEF2F2", data: { items: [{ type: "text", content: "" }] } },
              { kind: "menu", label: "Menu", icon: AlignLeft, color: "#8B5CF6", bg: "#F5F3FF" },
              { kind: "action", label: "Ação", icon: Zap, color: "#F59E0B", bg: "#FFFBEB", data: { actions: [] } },
              { kind: "condition", label: "Condição", icon: Code, color: "#3B82F6", bg: "#EFF6FF" },
              { kind: "flow_connection", label: "Conexão de fluxo", icon: Plus, color: "#10B981", bg: "#ECFDF5" },
              { kind: "randomizer", label: "Randomizador", icon: Code, color: "#06B6D4", bg: "#ECFEFF" },
              { kind: "wait", label: "Atraso inteligente", icon: Clock, color: "#F97316", bg: "#FFF7ED", data: { seconds: 259200 } },
              { kind: "http_request", label: "Integração", icon: Code, color: "#EC4899", bg: "#FDF2F8" },
              { kind: "ai", label: "Assistente GPT", icon: Bookmark, color: "#14B8A6", bg: "#F0FDFA" },
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.kind}
                  onClick={() => {
                    const nextPos = { x: node.position.x + 340, y: node.position.y };
                    const newId = addNode(opt.kind, nextPos, opt.data);
                    connect({ source: node.id, target: newId, sourceHandle: "default", label: null });
                    selectNode(newId);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 text-left transition-all group"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ backgroundColor: opt.bg, color: opt.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 group-hover:text-blue-600">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (kind === "menu") {
    const menuMode = (data.menuMode as string) || "list";
    const questionText = (data.questionText as string) || (data.text as string) || "";
    const invalidInputText = (data.invalidInputText as string) || "";
    const errorLimit = (data.errorLimit as number) || 3;
    const buttonTitle = (data.buttonTitle as string) || "VER OPÇÕES";
    const options = (data.options as Array<{ id: string; label: string; handleId?: string }>) || [];
    const expirationDelay = (data.expirationDelay as string) || "1 Dias";

    const handleAddOption = () => {
      const newOptId = `opt_${Date.now()}`;
      const newOpt = {
        id: newOptId,
        label: `Opção ${options.length + 1}`,
        handleId: `handle_${newOptId}`,
      };
      updateNodeData(node.id, { options: [...options, newOpt] });
    };

    const handleUpdateOption = (optId: string, label: string) => {
      const updated = options.map((o) => (o.id === optId ? { ...o, label } : o));
      updateNodeData(node.id, { options: updated });
    };

    const handleRemoveOption = (optId: string) => {
      const updated = options.filter((o) => o.id !== optId);
      updateNodeData(node.id, { options: updated });
    };

    return (
      <div className="absolute top-0 left-0 bottom-0 z-30 w-80 bg-white border-r border-gray-200 shadow-2xl flex flex-col font-sans animate-in slide-in-from-left duration-200">
        {/* Header do Menu */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-purple-50/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-purple-100 text-purple-600">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Menu</h2>
          </div>
          <button
            onClick={() => clearSelection()}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {/* Seletor de Tipo de Menu (Radio Buttons) */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer font-medium text-gray-700">
              <input
                type="radio"
                name="menuMode"
                checked={menuMode === "list"}
                onChange={() => updateNodeData(node.id, { menuMode: "list" })}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              Botão de lista
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer font-medium text-gray-700">
              <input
                type="radio"
                name="menuMode"
                checked={menuMode === "number"}
                onChange={() => updateNodeData(node.id, { menuMode: "number" })}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              Número
            </label>
          </div>

          {/* Texto da pergunta */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 block">Texto da pergunta</label>
            <div className="p-3 bg-purple-50/20 border border-purple-200 rounded-2xl space-y-2">
              <textarea
                value={questionText}
                onChange={(e) => updateNodeData(node.id, { questionText: e.target.value })}
                placeholder="Insira a mensagem do menu..."
                rows={3}
                className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
              />
              <div className="flex items-center justify-between text-gray-400 px-1">
                <div className="flex items-center gap-3">
                  <Bold className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                  <Italic className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                  <AlignLeft className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                  <Code className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button className="px-3 py-1 text-xs text-blue-500 font-medium hover:bg-blue-50 rounded-lg">Cancelar</button>
                <button onClick={() => toast.success("Texto da pergunta salvo")} className="px-4 py-1.5 text-xs text-white bg-blue-400 font-semibold rounded-xl hover:bg-blue-500 shadow-sm">Salvar</button>
              </div>
            </div>
          </div>

          {/* Se Modo for Número */}
          {menuMode === "number" && (
            <>
              <div className="space-y-1.5">
                <label className="font-bold text-gray-800 block">Texto para entrada inválida</label>
                <div className="p-3 bg-purple-50/20 border border-purple-200 rounded-2xl space-y-2">
                  <textarea
                    value={invalidInputText}
                    onChange={(e) => updateNodeData(node.id, { invalidInputText: e.target.value })}
                    placeholder="Opção inválida..."
                    rows={3}
                    className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                  />
                  <div className="flex items-center justify-between text-gray-400 px-1">
                    <div className="flex items-center gap-3">
                      <Bold className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <Italic className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <AlignLeft className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <Code className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button className="px-3 py-1 text-xs text-blue-500 font-medium hover:bg-blue-50 rounded-lg">Cancelar</button>
                    <button onClick={() => toast.success("Texto salvo")} className="px-4 py-1.5 text-xs text-white bg-blue-400 font-semibold rounded-xl hover:bg-blue-500 shadow-sm">Salvar</button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-gray-600 block">Limitar a quantidade de erros que depois usam saída adicional</label>
                <select
                  value={errorLimit}
                  onChange={(e) => updateNodeData(node.id, { errorLimit: parseInt(e.target.value) })}
                  className="w-24 p-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-800"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </div>
            </>
          )}

          {/* Se Modo for Botão de Lista */}
          {menuMode === "list" && (
            <div className="space-y-1.5">
              <label className="font-bold text-gray-800 block">Título do botão</label>
              <div className="p-3 bg-purple-50/20 border border-purple-200 rounded-2xl space-y-2">
                <input
                  type="text"
                  value={buttonTitle}
                  onChange={(e) => updateNodeData(node.id, { buttonTitle: e.target.value })}
                  placeholder="VER OPÇÕES"
                  className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button className="px-3 py-1 text-xs text-blue-500 font-medium hover:bg-blue-50 rounded-lg">Cancelar</button>
                  <button onClick={() => toast.success("Título do botão salvo")} className="px-4 py-1.5 text-xs text-white bg-blue-400 font-semibold rounded-xl hover:bg-blue-500 shadow-sm">Salvar</button>
                </div>
              </div>
            </div>
          )}

          {/* Respostas adicionadas */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="text-center text-xs font-semibold text-gray-400">—— Respostas ——</div>

            <div className="space-y-2">
              {options.map((opt) => (
                <div key={opt.id} className="flex items-center gap-2 p-2 bg-purple-50/60 border border-purple-100 rounded-xl">
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => handleUpdateOption(opt.id, e.target.value)}
                    className="flex-1 bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs font-semibold text-purple-900 focus:outline-none"
                  />
                  <button
                    onClick={() => handleRemoveOption(opt.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Excluir resposta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddOption}
              className="w-full py-2.5 border-2 border-dashed border-purple-200 bg-purple-50/30 hover:bg-purple-50 text-purple-700 font-semibold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Adicionar nova resposta
            </button>
          </div>

          {/* Se usuário não responder */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2 pt-3">
            <span className="font-bold text-gray-800 block">Se usuário não responder</span>
            <div className="flex items-center gap-1.5 text-gray-600">
              <span>Mensagem expira em</span>
              <select
                value={expirationDelay}
                onChange={(e) => updateNodeData(node.id, { expirationDelay: e.target.value })}
                className="font-bold text-gray-900 bg-white border border-gray-200 rounded px-1.5 py-0.5"
              >
                <option value="1 Dias">1 Dias</option>
                <option value="2 Dias">2 Dias</option>
                <option value="3 Dias">3 Dias</option>
                <option value="1 Horas">1 Horas</option>
              </select>
            </div>
            <div className="pt-1">
              <span className="text-[11px] text-gray-400 block mb-1">Você pode iniciar outra Automação quando o tempo expirar sem resposta:</span>
              <div className="p-2.5 border-2 border-dashed border-gray-200 rounded-xl text-center font-medium text-gray-500 bg-white">
                Conecte no fluxo
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "action") {
    const actions = (data.actions as ContainerActionItem[]) || [];

    const ALL_ACTION_OPTIONS = [
      { id: "add_tag", label: "Adicionar etiqueta" },
      { id: "remove_tag", label: "Remover etiqueta" },
      { id: "custom_event", label: "Adicionar evento personalizado" },
      { id: "kanban", label: "Criar/Atualizar cartão Kanban" },
      { id: "subscribe_seq", label: "Inscrição em sequência" },
      { id: "unsubscribe_seq", label: "Descadastrar de sequência" },
      { id: "set_field", label: "Definir/Atualizar o valor de um campo" },
      { id: "open_ticket", label: "Definir atendimento como aberto" },
      { id: "assign_ticket", label: "Atribuir e abrir atendimento" },
      { id: "notify_team", label: "Notificar membro da equipe" },
      { id: "unassign_chat", label: "Remover atribuição do chat" },
      { id: "close_ticket", label: "Definir atendimento como concluído" },
      { id: "clear_field", label: "Limpar valor do campo" },
      { id: "clear_referral", label: "Limpar campo de indicações" },
      { id: "pause_automation", label: "Pausar automação" },
      { id: "restart_automation", label: "Reiniciar automação" },
      { id: "clear_gpt_memory", label: "Excluir memória (thread) do Assistente GPT" },
    ];

    const filteredOptions = ALL_ACTION_OPTIONS.filter((opt) =>
      opt.label.toLowerCase().includes(actionSearch.toLowerCase())
    );

    const handleSelectAction = (opt: { id: string; label: string }) => {
      const newAct: ContainerActionItem = {
        id: `act_${Date.now()}`,
        type: opt.id,
        label: opt.label,
      };
      updateNodeData(node.id, { actions: [...actions, newAct] });
      setPopoverOpen(false);
      setActionSearch("");
      toast.success(`Ação "${opt.label}" adicionada`);
    };

    const handleRemoveActionItem = (actId: string) => {
      const updated = actions.filter((a) => a.id !== actId);
      updateNodeData(node.id, { actions: updated });
    };

    return (
      <div className="absolute top-0 left-0 bottom-0 z-30 w-80 bg-white border-r border-gray-200 shadow-2xl flex flex-col font-sans animate-in slide-in-from-left duration-200">
        {/* Header da Ação */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-amber-50/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-amber-500 text-white shadow-sm">
              <Zap className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Ação</h2>
          </div>
          <button
            onClick={() => clearSelection()}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Botão Adicionar Ação (Amarelo Pontilhado) */}
          <button
            onClick={() => setPopoverOpen(!popoverOpen)}
            className="w-full py-3 border-2 border-dashed border-amber-200 bg-amber-50/30 hover:bg-amber-50 text-amber-700 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            Adicionar Ação
          </button>

          {/* Menu Dropdown / Popover de Busca de Ações (Prints do Usuário) */}
          {popoverOpen && (
            <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-xl space-y-2 animate-in zoom-in-95 duration-150 relative z-40">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={actionSearch}
                  onChange={(e) => setActionSearch(e.target.value)}
                  placeholder="Busca"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-0.5 pt-1">
                {filteredOptions.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-2">Nenhuma ação encontrada</p>
                ) : (
                  filteredOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectAction(opt)}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-amber-50 hover:text-amber-900 rounded-xl transition-colors block"
                    >
                      {opt.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Lista de Ações Adicionadas */}
          <div className="space-y-2 pt-2">
            {actions.map((act) => (
              <div
                key={act.id}
                className="p-3 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{act.label || act.type}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveActionItem(act.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Excluir ação"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Campos adicionais por tipo de ação */}
                {(act.type === "add_tag" || act.type === "remove_tag") && (
                  <input
                    type="text"
                    placeholder="Nome da etiqueta..."
                    value={act.tagName || ""}
                    onChange={(e) => {
                      const updated = actions.map((a) => (a.id === act.id ? { ...a, tagName: e.target.value } : a));
                      updateNodeData(node.id, { actions: updated });
                    }}
                    className="w-full p-2 bg-white border border-amber-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                )}

                {act.type === "notify_team" && (
                  <input
                    type="text"
                    placeholder="Nome do membro da equipe..."
                    value={act.memberName || ""}
                    onChange={(e) => {
                      const updated = actions.map((a) => (a.id === act.id ? { ...a, memberName: e.target.value } : a));
                      updateNodeData(node.id, { actions: updated });
                    }}
                    className="w-full p-2 bg-white border border-amber-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const items = (data.items as ContainerSubItem[]) || [];
  const actions = (data.actions as ContainerActionItem[]) || [];
  const isActionKind = kind === "action";

  const handleAddItem = (type: ContainerSubItem["type"]) => {
    const newItemId = `item_${Date.now()}`;
    let newItem: ContainerSubItem = { id: newItemId, type };

    if (type === "text") newItem.content = "";
    if (type === "delay") newItem.seconds = 5;
    if (type === "contact") {
      newItem.name = "";
      newItem.phone = "";
    }
    if (type === "save_response") {
      newItem.question = "";
      newItem.variableName = "resposta_usuario";
    }

    const updated = [...items, newItem];
    updateNodeData(node.id, { items: updated });
  };

  const handleDuplicateItem = (index: number) => {
    const itemToCopy = items[index];
    if (!itemToCopy) return;
    const newItem = { ...itemToCopy, id: `item_${Date.now()}` };
    const updated = [...items];
    updated.splice(index + 1, 0, newItem);
    updateNodeData(node.id, { items: updated });
    toast.success("Item duplicado");
  };

  const handleRemoveItem = (itemId: string) => {
    const updated = items.filter((i) => i.id !== itemId);
    updateNodeData(node.id, { items: updated });
  };

  const handleUpdateItem = (itemId: string, patch: Partial<ContainerSubItem>) => {
    const updated = items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
    updateNodeData(node.id, { items: updated });
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return;
    const updated = [...items];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    updateNodeData(node.id, { items: updated });
  };

  const handleAddAction = (type: ContainerActionItem["type"]) => {
    const newActId = `act_${Date.now()}`;
    let newAct: ContainerActionItem = { id: newActId, type };

    if (type === "add_tag" || type === "remove_tag") newAct.tagName = "ETIQUETA";
    if (type === "notify_team") newAct.memberName = "Membro da equipe";

    const updated = [...actions, newAct];
    updateNodeData(node.id, { actions: updated });
  };

  const handleRemoveAction = (actionId: string) => {
    const updated = actions.filter((a) => a.id !== actionId);
    updateNodeData(node.id, { actions: updated });
  };

  return (
    <div className="absolute top-0 left-0 bottom-0 z-30 w-80 bg-white border-r border-gray-200 shadow-2xl flex flex-col font-sans animate-in slide-in-from-left duration-200">
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <h2 className="text-base font-semibold text-gray-800">
            {isActionKind ? "Ação" : "Conteúdo"}
          </h2>
        </div>
        <button
          onClick={() => clearSelection()}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Sub-itens com Reordenação Drag-and-Drop + Toolbar Flutuante */}
        {!isActionKind && items.map((item, index) => {
          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedIndex !== null) {
                  handleReorder(draggedIndex, index);
                  setDraggedIndex(null);
                }
              }}
              className="relative group transition-transform"
            >
              {/* Barra Flutuante de Ações na Borda Direita do Card (Botconversa) */}
              <div className="absolute -right-2 top-2 z-20 flex items-center bg-white border border-gray-200 rounded-lg shadow-md px-1 py-0.5 text-gray-600 gap-0.5 opacity-90 group-hover:opacity-100">
                <div
                  className="p-1 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing"
                  title="Arrastar e Soltar"
                >
                  <GripVertical className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <button
                  onClick={() => handleDuplicateItem(index)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600"
                  title="Duplicar item"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="p-1 hover:bg-red-50 rounded text-red-500"
                  title="Excluir item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Item: Texto */}
              {item.type === "text" && (
                <div className="p-3 bg-red-50/20 border border-red-200 rounded-2xl space-y-3">
                  <textarea
                    value={item.content || ""}
                    onChange={(e) => handleUpdateItem(item.id, { content: e.target.value })}
                    placeholder="Insira texto"
                    rows={4}
                    className="w-full p-2.5 bg-white border border-red-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  />
                  <div className="flex items-center justify-between text-gray-400 px-1">
                    <div className="flex items-center gap-3">
                      <Bold className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <Italic className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <AlignLeft className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <Code className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => handleUpdateItem(item.id, { content: "" })}
                      className="px-3 py-1 text-xs text-blue-500 font-medium hover:bg-blue-50 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => toast.success("Texto salvo no bloco")}
                      className="px-4 py-1.5 text-xs text-white bg-blue-400 font-semibold rounded-xl hover:bg-blue-500 shadow-sm"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}

              {/* Item: Imagem (com preview enviado + botão fechar X) */}
              {item.type === "image" && (
                <div className="p-4 bg-red-50/20 border-2 border-dashed border-red-200 rounded-2xl text-center space-y-2 relative">
                  {item.url ? (
                    <div className="relative w-44 h-44 mx-auto rounded-2xl overflow-hidden border border-gray-200 shadow-md group/img">
                      <img src={item.url} alt="Imagem enviada" className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleUpdateItem(item.id, { url: undefined })}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                        title="Remover imagem"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className="w-6 h-6 text-red-400 mx-auto" />
                      <p className="text-[11px] text-gray-500 leading-tight">
                        Tamanho máximo permitido: 2MB, Tipos de arquivos aceitos: jpg, jpeg, png, webp
                      </p>
                      <label className="inline-block text-xs font-bold text-red-500 hover:underline cursor-pointer">
                        Subir Imagem
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUpdateItem(item.id, { url: URL.createObjectURL(file), fileName: file.name });
                              toast.success("Imagem enviada com sucesso!");
                            }
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Item: Vídeo */}
              {item.type === "video" && (
                <div className="p-4 bg-red-50/20 border-2 border-dashed border-red-200 rounded-2xl text-center space-y-2 relative">
                  {item.url ? (
                    <div className="relative w-full p-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                      <span className="truncate font-semibold text-gray-700">{item.fileName || "Vídeo enviado"}</span>
                      <button
                        onClick={() => handleUpdateItem(item.id, { url: undefined, fileName: undefined })}
                        className="w-6 h-6 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs font-bold shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <Video className="w-6 h-6 text-red-400 mx-auto" />
                      <p className="text-[11px] text-gray-500 leading-tight">
                        Clique Aqui Para Subir Video. Tamanho do Video deve ser abaixo de 15MB e tipo pode ser .mp4
                      </p>
                      <label className="inline-block text-xs font-bold text-red-500 hover:underline cursor-pointer">
                        Subir Vídeo
                        <input
                          type="file"
                          accept="video/mp4"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUpdateItem(item.id, { url: URL.createObjectURL(file), fileName: file.name });
                              toast.success("Vídeo enviado com sucesso!");
                            }
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Item: Arquivo */}
              {item.type === "document" && (
                <div className="p-4 bg-red-50/20 border-2 border-dashed border-red-200 rounded-2xl text-center space-y-2 relative">
                  {item.url ? (
                    <div className="relative w-full p-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                      <span className="truncate font-semibold text-gray-700">{item.fileName || "Arquivo enviado"}</span>
                      <button
                        onClick={() => handleUpdateItem(item.id, { url: undefined, fileName: undefined })}
                        className="w-6 h-6 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs font-bold shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <FileText className="w-6 h-6 text-red-400 mx-auto" />
                      <p className="text-[11px] text-gray-500 leading-tight">
                        Clique Aqui Para Subir Arquivo. Tamanho do Arquivo deve ser abaixo de 15MB e tipo pode ser .pdf,.doc,.docx,.htm,.html,.json,.xml,.txt,.csv,.zip,.7z,.xls,.xlsx,.ppt,.pptx
                      </p>
                      <label className="inline-block text-xs font-bold text-red-500 hover:underline cursor-pointer">
                        Subir Arquivo
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUpdateItem(item.id, { url: URL.createObjectURL(file), fileName: file.name });
                              toast.success("Arquivo enviado com sucesso!");
                            }
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Item: Áudio */}
              {item.type === "audio" && (
                <div className="p-4 bg-red-50/20 border-2 border-dashed border-red-200 rounded-2xl text-center space-y-2 relative">
                  {item.url ? (
                    <div className="relative w-full p-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                      <span className="truncate font-semibold text-gray-700">{item.fileName || "Áudio enviado"}</span>
                      <button
                        onClick={() => handleUpdateItem(item.id, { url: undefined, fileName: undefined })}
                        className="w-6 h-6 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs font-bold shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <Volume2 className="w-6 h-6 text-red-400 mx-auto" />
                      <p className="text-[11px] text-gray-500 leading-tight">
                        Clique Aqui Para Subir Áudio. Tamanho do Áudio deve ser abaixo de 15MB e tipo pode ser .mp3
                      </p>
                      <label className="inline-block text-xs font-bold text-red-500 hover:underline cursor-pointer">
                        Subir Áudio
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUpdateItem(item.id, { url: URL.createObjectURL(file), fileName: file.name });
                              toast.success("Áudio enviado com sucesso!");
                            }
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Item: Salvar (Capturar Resposta) */}
              {item.type === "save_response" && (
                <div className="p-3 bg-red-50/20 border border-red-200 rounded-2xl space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700">Salvar</span>
                  </div>
                  <textarea
                    value={item.question || ""}
                    onChange={(e) => handleUpdateItem(item.id, { question: e.target.value })}
                    placeholder="Insira sua pergunta aqui"
                    rows={3}
                    className="w-full p-2.5 bg-white border border-red-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  />
                  <div className="flex items-center justify-between text-gray-400 px-1">
                    <div className="flex items-center gap-3">
                      <Bold className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <Italic className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <AlignLeft className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      <Code className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <button
                      onClick={() => setActiveSaveConfigId(activeSaveConfigId === item.id ? null : item.id)}
                      className="text-xs font-semibold text-red-500 hover:underline flex items-center gap-1"
                    >
                      Escolher onde salvar <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toast.success("Pergunta salva no bloco")}
                      className="px-4 py-1.5 text-xs text-white bg-blue-400 font-semibold rounded-xl hover:bg-blue-500 shadow-sm"
                    >
                      Salvar
                    </button>
                  </div>

                  {/* Modal / Painel de Configuração Detalhada de Salvar Resposta (Prints do Usuário) */}
                  {activeSaveConfigId === item.id && (
                    <div className="p-4 bg-white border-2 border-indigo-300 rounded-2xl shadow-2xl space-y-4 my-2 animate-in zoom-in-95 duration-150 text-xs relative z-30">
                      {/* 1. Tipo de resposta */}
                      <div className="space-y-1">
                        <label className="font-bold text-gray-800 block">Tipo de resposta</label>
                        <select
                          value={item.responseType || "Texto"}
                          onChange={(e) => handleUpdateItem(item.id, { responseType: e.target.value })}
                          className="w-full p-2.5 bg-gray-50 border-2 border-indigo-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="Texto">Texto</option>
                          <option value="Número">Número</option>
                          <option value="Data">Data</option>
                          <option value="Data e hora">Data e hora</option>
                          <option value="Primeiro nome">Primeiro nome</option>
                          <option value="Sobrenome">Sobrenome</option>
                          <option value="Nome completo">Nome completo</option>
                          <option value="Código de Indicação">Código de Indicação</option>
                          <option value="Imagem">Imagem</option>
                          <option value="Video">Video</option>
                          <option value="Áudio">Áudio</option>
                          <option value="Arquivo">Arquivo</option>
                          <option value="E-mail">E-mail</option>
                          <option value="CPF">CPF</option>
                        </select>
                      </div>

                      {/* 2. Salve a resposta em um campo */}
                      <div className="space-y-1">
                        <label className="font-bold text-gray-800 block">Salve a resposta em um campo</label>
                        <select
                          value={item.variableName || "resposta_usuario"}
                          onChange={(e) => {
                            if (e.target.value === "NEW_FIELD") {
                              const newField = prompt("Digite o nome do novo campo do usuário:");
                              if (newField) handleUpdateItem(item.id, { variableName: newField });
                            } else {
                              handleUpdateItem(item.id, { variableName: e.target.value });
                            }
                          }}
                          className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="resposta_usuario">resposta_usuario</option>
                          <option value="email">email</option>
                          <option value="telefone">telefone</option>
                          <option value="nome">nome</option>
                          <option value="cpf">cpf</option>
                          <option value="NEW_FIELD">+ Adicionar novo campo do usuário</option>
                        </select>
                      </div>

                      {/* 3. Ação após resposta válida */}
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                        <span className="font-bold text-gray-800 block">Ação após resposta válida</span>
                        <p className="text-[11px] text-gray-500">Conectar a um bloco de ação no construtor de fluxo</p>
                      </div>

                      {/* 4. Se usuário não responder */}
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                        <span className="font-bold text-gray-800 block">Se usuário não responder</span>
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span>Entrada expira em</span>
                          <select
                            value={item.expirationDelay || "1 Dias"}
                            onChange={(e) => handleUpdateItem(item.id, { expirationDelay: e.target.value })}
                            className="font-bold text-gray-900 bg-white border border-gray-200 rounded px-1.5 py-0.5"
                          >
                            <option value="1 Dias">1 Dias</option>
                            <option value="2 Dias">2 Dias</option>
                            <option value="3 Dias">3 Dias</option>
                            <option value="1 Horas">1 Horas</option>
                          </select>
                        </div>
                        <div className="pt-1">
                          <span className="text-[11px] text-gray-400 block mb-1">Você pode iniciar:</span>
                          <div className="p-2.5 border-2 border-dashed border-gray-200 rounded-xl text-center font-medium text-gray-500 bg-white">
                            Conecte no fluxo
                          </div>
                        </div>
                      </div>

                      {/* 5. Mensagem de erro em caso de resposta inválida */}
                      <div className="space-y-2">
                        <label className="font-bold text-gray-800 block">Mensagem de erro em caso de resposta inválida</label>
                        <div className="p-2.5 bg-red-50/20 border border-red-200 rounded-xl space-y-2">
                          <textarea
                            value={item.errorMessage || ""}
                            onChange={(e) => handleUpdateItem(item.id, { errorMessage: e.target.value })}
                            placeholder="Insira mensagem de erro..."
                            rows={3}
                            className="w-full p-2 bg-white border border-red-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                          />
                          <div className="flex items-center justify-between text-gray-400 px-1">
                            <div className="flex items-center gap-3">
                              <Bold className="w-4 h-4 cursor-pointer" />
                              <Italic className="w-4 h-4 cursor-pointer" />
                              <AlignLeft className="w-4 h-4 cursor-pointer" />
                              <Code className="w-4 h-4 cursor-pointer" />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setActiveSaveConfigId(null)} className="px-3 py-1 text-xs text-blue-500 font-medium hover:bg-blue-50 rounded-lg">Cancelar</button>
                            <button onClick={() => { setActiveSaveConfigId(null); toast.success("Configuração de resposta salva"); }} className="px-4 py-1.5 text-xs text-white bg-blue-400 font-semibold rounded-xl hover:bg-blue-500 shadow-sm">Salvar</button>
                          </div>
                        </div>
                      </div>

                      {/* 6. Tentar X vezes */}
                      <div className="pt-2 border-t border-gray-100 flex items-center gap-1.5 text-gray-700">
                        <span>Tentar</span>
                        <select
                          value={item.retryCount || 3}
                          onChange={(e) => handleUpdateItem(item.id, { retryCount: parseInt(e.target.value) })}
                          className="font-bold text-gray-900 bg-white border border-gray-200 rounded px-1.5 py-0.5"
                        >
                          <option value={1}>1 vez</option>
                          <option value={2}>2 vezes</option>
                          <option value={3}>3 vezes</option>
                          <option value={5}>5 vezes</option>
                        </select>
                        <span>se entrada do usuário for inválida</span>
                      </div>
                    </div>
                  )}

                  <div className="text-center text-[10px] text-gray-400 pt-2 border-t border-gray-100">
                    —— Aguardando uma resposta do usuário ——
                  </div>
                </div>
              )}

              {/* Item: Atraso */}
              {item.type === "delay" && (
                <div className="p-3 bg-red-50/20 border border-red-200 rounded-2xl space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700">Atraso</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Por favor selecione a duração do delay</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={60}
                      value={item.seconds ?? 5}
                      onChange={(e) => handleUpdateItem(item.id, { seconds: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="flex-1 accent-red-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={item.seconds ?? 5}
                        onChange={(e) => handleUpdateItem(item.id, { seconds: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-14 p-1 text-xs font-bold text-red-600 bg-white border border-gray-200 rounded text-center focus:ring-2 focus:ring-red-400"
                      />
                      <span className="text-xs font-medium text-gray-600">seg</span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 pt-1 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.typing ?? true}
                      onChange={(e) => handleUpdateItem(item.id, { typing: e.target.checked })}
                      className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                    />
                    Ativar Digitando
                  </label>
                </div>
              )}

              {/* Item: Auto-Off */}
              {item.type === "auto_off" && (
                <div className="p-3 bg-red-50/20 border border-red-200 rounded-2xl space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700">Auto-Off</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Desligar resposta padrão por</p>
                  <input
                    type="text"
                    defaultValue="00:00:00"
                    className="w-full p-2 bg-white border border-gray-200 rounded-xl text-center text-sm font-mono tracking-widest focus:ring-2 focus:ring-red-400"
                  />
                </div>
              )}

              {/* Item: Contato */}
              {item.type === "contact" && (
                <div className="p-3 bg-red-50/20 border border-red-200 rounded-2xl space-y-2.5 relative text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-red-500" /> Enviar cartão de contato
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 p-2 bg-amber-50 rounded-xl text-[10px] text-amber-800">
                    <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                    Preencha e salve o número e o nome
                  </div>
                  <input
                    type="text"
                    placeholder="Nome"
                    value={item.name || ""}
                    onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                    className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    placeholder="+55..."
                    value={item.phone || ""}
                    onChange={(e) => handleUpdateItem(item.id, { phone: e.target.value })}
                    className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs"
                  />
                  <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer pt-1">
                    <input type="checkbox" className="rounded border-gray-300 text-blue-600" />
                    Utilizar o número de WhatsApp conectado
                  </label>
                  <button
                    onClick={() => toast.success("Contato salvo no bloco")}
                    className="w-full py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-xs shadow-sm"
                  >
                    Salvar
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Grade de 9 Sub-elementos para Inserção (Botconversa) */}
        {!isActionKind && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Adicionar ao Conteúdo
            </span>

            <div className="grid grid-cols-3 gap-2">
              {[
                { type: "text", label: "Texto", icon: Type },
                { type: "image", label: "Imagem", icon: ImageIcon },
                { type: "video", label: "Vídeo", icon: Video },
                { type: "document", label: "Arquivo", icon: FileText },
                { type: "audio", label: "Áudio", icon: Volume2 },
                { type: "save_response", label: "Salvar", icon: Bookmark },
                { type: "delay", label: "Atraso", icon: Clock },
                { type: "auto_off", label: "AutoOff", icon: PowerOff },
                { type: "contact", label: "Contato", icon: User },
              ].map((btn) => {
                const Icon = btn.icon;
                return (
                  <button
                    key={btn.type}
                    onClick={() => handleAddItem(btn.type as ContainerSubItem["type"])}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-red-100 bg-red-50/20 hover:bg-red-50 hover:border-red-300 text-red-600 transition-all group"
                  >
                    <Icon className="w-5 h-5 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-medium text-gray-700">{btn.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
