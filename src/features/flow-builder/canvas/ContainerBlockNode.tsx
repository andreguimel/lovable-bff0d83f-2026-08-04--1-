import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Star,
  Zap,
  Trash2,
  Copy,
  Clock,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Volume2,
  User,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Rocket,
  FileVideo,
} from "lucide-react";
import { useBuilderStore } from "../state/store";

export interface ContainerSubItem {
  id: string;
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "delay"
    | "contact"
    | "auto_off"
    | "save_response";
  content?: string;
  url?: string;
  fileName?: string;
  seconds?: number;
  typing?: boolean;
  name?: string;
  phone?: string;
  question?: string;
  variableName?: string;
  responseType?: string;
  expirationDelay?: string;
  errorMessage?: string;
  retryCount?: number;
  onValidHandleId?: string;
  onNoReplyHandleId?: string;
}

export interface ContainerActionItem {
  id: string;
  type:
    | "add_tag"
    | "remove_tag"
    | "remove_attribution"
    | "pause_automation"
    | "notify_team";
  tagName?: string;
  duration?: string;
  memberName?: string;
  note?: string;
}

function ContainerBlockNodeInner(props: NodeProps) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  const kind = (data.__kind as string) ?? "message";
  const selected = Boolean(props.selected);
  const nodeId = props.id;

  const removeNode = useBuilderStore((s) => s.removeNode);
  const duplicateNode = useBuilderStore((s) => s.duplicateNode);

  const items = (data.items as ContainerSubItem[]) ?? [];
  const actions = (data.actions as ContainerActionItem[]) ?? [];

  const isStartKind = kind === "start";
  const isActionKind = kind === "action";
  const isContentKind = kind === "message" || kind === "container_content";

  const selectNode = useBuilderStore((s) => s.selectNode);

  if (isStartKind) {
    return (
      <div
        onClick={() => selectNode(nodeId)}
        className={`w-72 rounded-2xl border-2 border-blue-200 bg-white p-4 shadow-sm transition-all font-sans relative cursor-pointer hover:border-blue-400 group ${
          selected ? "ring-2 ring-blue-500 shadow-md border-blue-500" : ""
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600">
            <Rocket className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-gray-800">Bloco Inicial</span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Seu fluxo começa por este bloco. Conecte-o com outro bloco.
        </p>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-[11px] font-semibold text-blue-600 group-hover:underline">
            Adicionar próxima função →
          </span>
          <Handle
            type="source"
            id="default"
            position={Position.Right}
            className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-2"
          />
        </div>
      </div>
    );
  }

  // Estilos de borda e cores por categoria
  const cardBorderColor = isActionKind
    ? "border-amber-200 bg-amber-50/30"
    : "border-red-200 bg-red-50/20";
  const headerBg = isActionKind ? "bg-amber-100/70" : "bg-red-100/50";
  const headerTextColor = isActionKind ? "text-amber-900" : "text-red-900";
  const Icon = isActionKind ? Zap : Star;
  const iconColor = isActionKind ? "#F59E0B" : "#EF4444";

  return (
    <div
      className={`w-80 rounded-2xl border-2 bg-white shadow-md transition-all font-sans relative ${cardBorderColor} ${
        selected ? "ring-2 ring-blue-500 shadow-xl" : ""
      }`}
    >
      {/* Porta de Entrada (Left Handle) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
      />

      {/* Header do Card */}
      <div
        className={`flex items-center justify-between px-3.5 py-2.5 rounded-t-xl ${headerBg}`}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center bg-white shadow-sm"
            style={{ color: iconColor }}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className={`text-sm font-semibold ${headerTextColor}`}>
            {isActionKind ? "Ação" : "Conteúdo"}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              duplicateNode(nodeId);
            }}
            className="p-1 text-gray-600 hover:bg-white/60 rounded nodrag"
            title="Duplicar nó"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeNode(nodeId);
            }}
            className="p-1 text-red-600 hover:bg-white/60 rounded nodrag"
            title="Excluir nó"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Lista de Sub-itens (Conteúdo) */}
      {isContentKind && (
        <div className="p-3 space-y-2.5 max-h-[500px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              Nenhum item adicionado. Clique no bloco para editar.
            </div>
          ) : (
            items.map((item) => {
              if (item.type === "text") {
                return (
                  <div
                    key={item.id}
                    className="p-2.5 bg-red-50/50 border border-red-100 rounded-xl text-xs text-gray-700 leading-relaxed break-words"
                  >
                    {item.content || <span className="text-gray-400 italic">Insira texto</span>}
                  </div>
                );
              }

              if (item.type === "delay") {
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-orange-50 border border-orange-100 rounded-lg text-[11px] text-orange-700 font-medium"
                  >
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    <span>
                      Atraso {item.typing ? "Digitando " : ""}{item.seconds ?? 5} seg...
                    </span>
                  </div>
                );
              }

              if (item.type === "image") {
                return (
                  <div
                    key={item.id}
                    className="p-1 bg-red-50/50 border border-red-100 rounded-xl overflow-hidden"
                  >
                    {item.url ? (
                      <img src={item.url} alt="Thumbnail" className="w-full h-28 object-cover rounded-lg" />
                    ) : (
                      <div className="p-2 text-xs text-gray-500 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-red-400" />
                        <span>Suba uma imagem</span>
                      </div>
                    )}
                  </div>
                );
              }

              if (item.type === "video") {
                return (
                  <div
                    key={item.id}
                    className="p-2.5 bg-red-50/50 border border-red-100 rounded-xl text-xs text-gray-500 flex items-center gap-2"
                  >
                    <FileVideo className="w-4 h-4 text-red-400" />
                    <span>{item.url ? "Vídeo anexado" : "Suba um vídeo"}</span>
                  </div>
                );
              }

              if (item.type === "document") {
                return (
                  <div
                    key={item.id}
                    className="p-2.5 bg-red-50/50 border border-red-100 rounded-xl text-xs text-gray-500 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-red-400" />
                    <span>{item.url ? "Arquivo anexado" : "Suba um arquivo"}</span>
                  </div>
                );
              }

              if (item.type === "audio") {
                return (
                  <div
                    key={item.id}
                    className="p-2.5 bg-red-50/50 border border-red-100 rounded-xl text-xs text-gray-500 flex items-center gap-2"
                  >
                    <Volume2 className="w-4 h-4 text-red-400" />
                    <span>{item.url ? "Áudio anexado" : "Suba um áudio"}</span>
                  </div>
                );
              }

              if (item.type === "auto_off") {
                return (
                  <div
                    key={item.id}
                    className="p-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-700 flex items-center gap-2"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-gray-500" />
                    <span>Auto-Off (Desligar resposta padrão)</span>
                  </div>
                );
              }

              if (item.type === "contact") {
                return (
                  <div
                    key={item.id}
                    className="p-2 bg-white border border-gray-200 rounded-xl flex items-center gap-2 shadow-sm"
                  >
                    <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-gray-800">{item.name || "Contato"}</p>
                      <p className="text-[10px] text-gray-400">{item.phone || "+55..."}</p>
                    </div>
                  </div>
                );
              }

              if (item.type === "save_response") {
                const validHandleId = item.onValidHandleId || `${item.id}-valid`;
                const noReplyHandleId = item.onNoReplyHandleId || `${item.id}-noreply`;

                return (
                  <div
                    key={item.id}
                    className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 text-xs relative"
                  >
                    <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>Salvar Resposta</span>
                    </div>

                    <p className="text-gray-700 bg-white p-2 rounded-lg border border-amber-100">
                      {item.question || "Insira sua pergunta aqui"}
                    </p>

                    <div className="space-y-1.5 pt-1 text-[11px]">
                      {/* Sub-handle: Ação após resposta válida */}
                      <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded border border-amber-100 relative">
                        <span className="text-amber-800 font-medium flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          Ação após resposta válida
                        </span>
                        <Handle
                          type="source"
                          id={validHandleId}
                          position={Position.Right}
                          className="!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-4"
                        />
                      </div>

                      {/* Sub-handle: Se usuário não responder */}
                      <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded border border-amber-100 relative">
                        <span className="text-gray-600">Se usuário não responder</span>
                        <Handle
                          type="source"
                          id={noReplyHandleId}
                          position={Position.Right}
                          className="!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-4"
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className="p-2 bg-gray-50 border rounded-lg text-xs text-gray-600"
                >
                  Sub-item ({item.type})
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Body: Lista de Sub-itens (Ação) */}
      {isActionKind && (
        <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
          {actions.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              Nenhuma ação configurada. Clique no bloco para editar.
            </div>
          ) : (
            actions.map((act) => {
              return (
                <div
                  key={act.id}
                  className="p-2 bg-amber-50/60 border border-amber-100 rounded-lg text-xs text-amber-900 font-medium flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="capitalize">
                    {act.type === "add_tag" && `Adicionar etiqueta ${act.tagName || ""}`}
                    {act.type === "remove_tag" && `Remover etiqueta ${act.tagName || ""}`}
                    {act.type === "remove_attribution" && "Remover atribuição do chat"}
                    {act.type === "pause_automation" && `Pausar automação (${act.duration || "indefinidamente"})`}
                    {act.type === "notify_team" && `Notificar membro da equipe (${act.memberName || ""})`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Rodapé: Próximo Passo Handle */}
      <div className="px-3.5 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-xl relative">
        <span className="text-xs font-semibold text-gray-500">Próximo passo</span>
        <Handle
          type="source"
          id="next"
          position={Position.Right}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-2"
        />
      </div>
    </div>
  );
}

export const ContainerBlockNode = memo(ContainerBlockNodeInner);
