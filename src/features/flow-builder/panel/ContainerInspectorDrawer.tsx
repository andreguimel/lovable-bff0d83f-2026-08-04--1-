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
} from "lucide-react";
import { useBuilderStore } from "../state/store";
import type { ContainerSubItem, ContainerActionItem } from "../canvas/ContainerBlockNode";

export function ContainerInspectorDrawer() {
  const selectedNodeId = useBuilderStore((s) => s.selection.nodeIds[0]);
  const node = useBuilderStore((s) => (selectedNodeId ? s.nodesById[selectedNodeId] : null));
  const updateNodeData = useBuilderStore((s) => s.updateNodeData);
  const clearSelection = useBuilderStore((s) => s.clearSelection);

  const [activeItemText, setActiveItemText] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const addNode = useBuilderStore((s) => s.addNode);
  const connect = useBuilderStore((s) => s.connect);
  const selectNode = useBuilderStore((s) => s.selectNode);

  if (!node) return null;

  const kind = node.kind;
  const data = node.data || {};

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
  const items = (data.items as ContainerSubItem[]) || [];
  const actions = (data.actions as ContainerActionItem[]) || [];

  const isActionKind = kind === "action";

  const handleAddItem = (type: ContainerSubItem["type"]) => {
    const newItemId = `item_${Date.now()}`;
    let newItem: ContainerSubItem = { id: newItemId, type };

    if (type === "text") newItem.content = "Insira texto";
    if (type === "delay") newItem.seconds = 5;
    if (type === "contact") {
      newItem.name = "Nome do Contato";
      newItem.phone = "+5511999999999";
    }
    if (type === "save_response") {
      newItem.question = "Insira sua pergunta aqui";
      newItem.variableName = "resposta_usuario";
    }

    const updated = [...items, newItem];
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

  const handleRemoveItem = (itemId: string) => {
    const updated = items.filter((i) => i.id !== itemId);
    updateNodeData(node.id, { items: updated });
  };

  const handleRemoveAction = (actionId: string) => {
    const updated = actions.filter((a) => a.id !== actionId);
    updateNodeData(node.id, { actions: updated });
  };

  const handleSaveTextItem = () => {
    if (!editingItemId) return;
    const updated = items.map((item) =>
      item.id === editingItemId ? { ...item, content: activeItemText } : item
    );
    updateNodeData(node.id, { items: updated });
    setEditingItemId(null);
    setActiveItemText("");
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
        {/* Editor de Texto do Item Selecionado */}
        {editingItemId ? (
          <div className="bg-red-50/30 border border-red-200 rounded-2xl p-3 space-y-3">
            <textarea
              value={activeItemText}
              onChange={(e) => setActiveItemText(e.target.value)}
              placeholder="Insira texto"
              rows={4}
              className="w-full p-2.5 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />

            {/* Barra de Formatação */}
            <div className="flex items-center gap-3 text-gray-500 px-1">
              <button className="hover:text-gray-900" title="Negrito">
                <Bold className="w-4 h-4" />
              </button>
              <button className="hover:text-gray-900" title="Itálico">
                <Italic className="w-4 h-4" />
              </button>
              <button className="hover:text-gray-900" title="Alinhamento">
                <AlignLeft className="w-4 h-4" />
              </button>
              <button className="hover:text-gray-900" title="Variável">
                <Code className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingItemId(null)}
                className="px-4 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTextItem}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg shadow-sm transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        ) : null}

        {/* Lista de sub-itens configurados */}
        {!isActionKind && items.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Itens no Bloco
            </span>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between group hover:border-red-200 transition-colors"
                >
                  <div className="flex-1 truncate pr-2 text-xs font-medium text-gray-700">
                    {item.type === "text" && (item.content || "Item de Texto")}
                    {item.type === "delay" && `Atraso (${item.seconds}s)`}
                    {item.type === "image" && "Imagem"}
                    {item.type === "contact" && `Contato (${item.name})`}
                    {item.type === "save_response" && `Salvar Resposta`}
                  </div>

                  <div className="flex items-center gap-1">
                    {item.type === "text" && (
                      <button
                        onClick={() => {
                          setEditingItemId(item.id);
                          setActiveItemText(item.content || "");
                        }}
                        className="px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grade de 9 Sub-elementos para Inserção (Botconversa) */}
        {!isActionKind && (
          <div className="space-y-2">
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

        {/* Opções de Ação se o nó for do tipo Ação */}
        {isActionKind && (
          <div className="space-y-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Ações no Bloco
            </span>

            <div className="space-y-2">
              {actions.map((act) => (
                <div
                  key={act.id}
                  className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900"
                >
                  <span>{act.type}</span>
                  <button
                    onClick={() => handleRemoveAction(act.id)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-2">
              <button
                onClick={() => handleAddAction("add_tag")}
                className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-medium border border-amber-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Etiqueta
              </button>
              <button
                onClick={() => handleAddAction("remove_tag")}
                className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-medium border border-amber-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Remover Etiqueta
              </button>
              <button
                onClick={() => handleAddAction("notify_team")}
                className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-medium border border-amber-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Notificar membro da equipe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
