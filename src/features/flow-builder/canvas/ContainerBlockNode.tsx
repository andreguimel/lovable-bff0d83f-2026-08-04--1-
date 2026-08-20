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
  LayoutGrid,
  Filter,
  GitFork,
  Shuffle,
  Target,
  Bot,
  Settings,
  ChevronRight,
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
  type: string;
  label?: string;
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

  const isMenuKind = kind === "menu";

  if (isMenuKind) {
    const menuMode = (data.menuMode as string) || "list";
    const questionText = (data.questionText as string) || (data.text as string) || "";
    const invalidInputText = (data.invalidInputText as string) || "";
    const errorLimit = (data.errorLimit as number) || 3;
    const buttonTitle = (data.buttonTitle as string) || "VER OPÇÕES";
    const options = (data.options as Array<{ id: string; label: string; handleId?: string }>) || [];

    return (
      <div
        className={`w-80 rounded-2xl border-2 border-purple-200 bg-white shadow-md transition-all font-sans relative ${
          selected ? "ring-2 ring-purple-500 shadow-xl border-purple-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        />

        {/* Header do Card Menu */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-purple-100 text-purple-600">
              <LayoutGrid className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-purple-900">Menu</span>
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

        {/* Caixa de Métricas (0 Enviado | 0% Clicada) */}
        <div className="p-3">
          <div className="grid grid-cols-2 bg-purple-50/50 border border-purple-100 rounded-xl p-2 text-center text-xs mb-3">
            <div className="border-r border-purple-100 pr-1">
              <div className="font-bold text-purple-900 text-sm">0</div>
              <div className="text-[10px] text-purple-400 font-medium">Enviado</div>
            </div>
            <div className="pl-1">
              <div className="font-bold text-purple-900 text-sm">0%</div>
              <div className="text-[10px] text-purple-400 font-medium">Clicada</div>
            </div>
          </div>

          <div className="space-y-2.5">
            {/* Texto da Pergunta */}
            <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-700">
              <span className="text-gray-400 block text-[10px]">Texto da pergunta</span>
              <p className="font-medium text-gray-800 break-words">{questionText || <span className="italic text-gray-400">Texto da pergunta</span>}</p>
            </div>

            {/* Modo Número */}
            {menuMode === "number" && (
              <>
                <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-700">
                  <span className="text-gray-400 block text-[10px]">Texto para entrada inválida</span>
                  <p className="font-medium text-gray-800 break-words">{invalidInputText || <span className="italic text-gray-400">Texto para entrada inválida</span>}</p>
                </div>

                <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs relative flex items-center justify-between">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Saída de erro</span>
                    <p className="text-[11px] text-gray-700 font-medium">Limitar a quantidade de erros que depois usam saída adicional: <span className="font-bold">{errorLimit}</span></p>
                  </div>
                  <Handle
                    type="source"
                    id="error_output"
                    position={Position.Right}
                    className="!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-4"
                  />
                </div>
              </>
            )}

            {/* Modo Botão de Lista */}
            {menuMode === "list" && (
              <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs">
                <span className="text-gray-400 block text-[10px]">Nome da lista de botões</span>
                <p className="font-bold text-gray-800 tracking-wide uppercase">{buttonTitle || "VER OPÇÕES"}</p>
              </div>
            )}

            {/* Lista de Respostas (com seus handles azuis) */}
            {options.map((opt, idx) => {
              const handleId = opt.handleId || `option_${opt.id || idx}`;
              return (
                <div key={opt.id || idx} className="p-2.5 bg-purple-50/60 border border-purple-100 rounded-xl text-xs font-semibold text-purple-900 flex items-center justify-between relative">
                  <span>{opt.label || `Opção ${idx + 1}`}</span>
                  <Handle
                    type="source"
                    id={handleId}
                    position={Position.Right}
                    className="!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-4"
                  />
                </div>
              );
            })}

            {/* Se usuário não responder */}
            <div className="pt-2 text-right relative flex items-center justify-end">
              <span className="text-[11px] text-gray-500 font-medium mr-2">Se usuário não responder</span>
              <Handle
                type="source"
                id="no_reply"
                position={Position.Right}
                className="!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-4"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isAssistantGptKind = kind === "ai" || kind === "ai_agent" || kind === "assistant_gpt" || kind === "gpt";

  if (isAssistantGptKind) {
    const assistantName = (data.assistantName as string) || (data.label as string) || "";
    const sentCount = (data.sentCount as number) ?? 142;
    const methodText = (data.methodText as string) || "Assistente de IA";

    const rawInstructions =
      (data.instructions as string) ||
      (data.persona as string) ||
      "PERSONA Você é Camila, especialista em recuperação de crédito ...";
    const instructionsPreview =
      rawInstructions.length > 55 ? `${rawInstructions.slice(0, 55)} ...` : rawInstructions;

    const inactivityValue = (data.inactivityTimeoutValue as number) ?? 24;
    const inactivityUnit = (data.inactivityTimeoutUnit as string) || "h";
    const inactivityText = `${inactivityValue} ${inactivityUnit.charAt(0).toLowerCase() === "h" ? "h" : inactivityUnit}`;
    const inactivityCtr = (data.inactivityCtr as string) || "97.18%";

    const successCtr = (data.successCtr as string) || "1.41%";
    const failureCtr = (data.failureCtr as string) || "2.11%";
    const exitConditions = (data.exitConditions as Array<{ id: string; name: string; ctr?: string }>) || [];

    return (
      <div
        className={`w-72 rounded-2xl border border-teal-200/90 bg-white shadow-lg transition-all font-sans relative ${
          selected ? "ring-2 ring-teal-500 shadow-xl border-teal-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) com Ícone de Seta Azul */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-5 !h-5 !bg-blue-500 !border-2 !border-white flex items-center justify-center text-white text-[10px] font-bold shadow-md hover:scale-110 transition-transform !-left-2.5"
          style={{ top: "32px" }}
        >
          <ChevronRight className="w-3 h-3 text-white stroke-[3]" />
        </Handle>

        {/* Header do Card Assistente GPT */}
        <div className="flex items-center justify-between px-3.5 py-3 rounded-t-2xl bg-white border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-teal-500 text-white shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-gray-900">Assistente GPT</span>
          </div>

          <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                duplicateNode(nodeId);
              }}
              className="p-1 text-gray-600 hover:bg-gray-100 rounded nodrag"
              title="Duplicar nó"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeNode(nodeId);
              }}
              className="p-1 text-red-600 hover:bg-red-50 rounded nodrag"
              title="Excluir nó"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body do Card Assistente GPT */}
        <div className="p-3 space-y-2.5">
          {/* Caixa de estatística de Envio (142 Enviado) */}
          <div className="py-2.5 px-3 bg-teal-50/40 border border-teal-100/80 rounded-xl text-center">
            <span className="text-base font-bold text-teal-600 block">{sentCount}</span>
            <span className="text-[11px] font-medium text-teal-600">Enviado</span>
          </div>

          {/* Método */}
          <div className="p-2.5 bg-teal-50/30 border border-teal-100/60 rounded-xl space-y-0.5">
            <span className="text-[11px] font-semibold text-teal-600 block">Método</span>
            <span className="text-xs font-semibold text-gray-800">{assistantName || methodText}</span>
          </div>

          {/* Instruções do assistente */}
          <div className="p-2.5 bg-teal-50/30 border border-teal-100/60 rounded-xl space-y-0.5">
            <span className="text-[11px] font-semibold text-teal-600 block">Instruções do assistente</span>
            <p className="text-[11px] text-gray-700 font-medium leading-tight line-clamp-2">
              {instructionsPreview}
            </p>
          </div>

          {/* Inatividade (Saída 1) */}
          <div className="p-2.5 bg-teal-50/30 border border-teal-100/60 rounded-xl flex items-center justify-between relative">
            <div>
              <span className="text-[11px] font-semibold text-teal-600 block">Inatividade</span>
              <span className="text-xs font-medium text-gray-700">{inactivityText}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200/80 shadow-2xs">
                CTR {inactivityCtr}
              </span>
              <Handle
                type="source"
                id="inactivity"
                position={Position.Right}
                className="!w-5 !h-5 !bg-blue-500 !border-2 !border-white flex items-center justify-center text-white text-[10px] font-bold shadow-md hover:scale-110 transition-transform !-right-2.5"
              >
                <ChevronRight className="w-3 h-3 text-white stroke-[3]" />
              </Handle>
            </div>
          </div>

          {/* Resposta bem-sucedida (Saída 2) */}
          <div className="py-2 px-1 flex items-center justify-between relative">
            <span className="text-xs font-medium text-gray-700">Resposta bem-sucedida</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200/60">
                CTR {successCtr}
              </span>
              <Handle
                type="source"
                id="success"
                position={Position.Right}
                className="!w-5 !h-5 !bg-blue-500 !border-2 !border-white flex items-center justify-center text-white text-[10px] font-bold shadow-md hover:scale-110 transition-transform !-right-2.5"
              >
                <ChevronRight className="w-3 h-3 text-white stroke-[3]" />
              </Handle>
            </div>
          </div>

          {/* Resposta falha (Saída 3) */}
          <div className="py-2 px-1 flex items-center justify-between relative">
            <span className="text-xs font-medium text-gray-700">Resposta falha</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200/60">
                CTR {failureCtr}
              </span>
              <Handle
                type="source"
                id="failure"
                position={Position.Right}
                className="!w-5 !h-5 !bg-blue-500 !border-2 !border-white flex items-center justify-center text-white text-[10px] font-bold shadow-md hover:scale-110 transition-transform !-right-2.5"
              >
                <ChevronRight className="w-3 h-3 text-white stroke-[3]" />
              </Handle>
            </div>
          </div>

          {/* Condições de Saída Personalizadas se houver */}
          {exitConditions.map((cond) => (
            <div key={cond.id} className="py-2 px-1 flex items-center justify-between relative border-t border-gray-100 pt-2">
              <span className="text-xs font-medium text-gray-700">{cond.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200/60">
                  CTR {cond.ctr || "0.00%"}
                </span>
                <Handle
                  type="source"
                  id={`exit_${cond.id}`}
                  position={Position.Right}
                  className="!w-5 !h-5 !bg-blue-500 !border-2 !border-white flex items-center justify-center text-white text-[10px] font-bold shadow-md hover:scale-110 transition-transform !-right-2.5"
                >
                  <ChevronRight className="w-3 h-3 text-white stroke-[3]" />
                </Handle>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isIntegrationKind = kind === "integration" || kind === "http_request" || kind === "webhook" || kind === "api_call";

  if (isIntegrationKind) {
    const integrations = (data.integrations as Array<{ id: string; type: string; label: string }>) || [];

    return (
      <div
        className={`w-80 rounded-2xl border-2 border-pink-300 bg-white shadow-md transition-all font-sans relative ${
          selected ? "ring-2 ring-pink-500 shadow-xl border-pink-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        />

        {/* Header do Card Integração */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-pink-50/80 border-b border-pink-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-pink-500 text-white shadow-sm">
              <Target className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-pink-950">Integração</span>
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

        {/* Body do Card Integração */}
        <div className="p-3 space-y-2.5">
          <p className="text-xs text-gray-500 font-medium">Qual ação deve ser tomada?</p>

          {integrations.length === 0 ? (
            <div className="space-y-2">
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2.5 px-3 border border-dashed border-pink-300 bg-pink-50/30 hover:bg-pink-50 text-pink-600 font-semibold rounded-2xl text-xs transition-colors text-center block nodrag"
              >
                Adicionar Integração do Zapier ✴️
              </button>
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2.5 px-3 border border-dashed border-pink-300 bg-pink-50/30 hover:bg-pink-50 text-pink-600 font-semibold rounded-2xl text-xs transition-colors text-center block nodrag"
              >
                Adicionar Integração de Webhook 🔗
              </button>
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2.5 px-3 border border-dashed border-pink-300 bg-pink-50/30 hover:bg-pink-50 text-pink-600 font-semibold rounded-2xl text-xs transition-colors text-center block nodrag"
              >
                Adicionar Google Sheets 📊
              </button>
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2.5 px-3 border border-dashed border-pink-300 bg-pink-50/30 hover:bg-pink-50 text-pink-600 font-semibold rounded-2xl text-xs transition-colors text-center block nodrag"
              >
                Adicionar integração com RD Station 🚀
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {integrations.map((integ) => (
                <div
                  key={integ.id}
                  className="p-2.5 bg-pink-50/70 border border-pink-200 rounded-xl text-xs text-pink-900 font-semibold flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Target className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                    <span className="truncate">{integ.label}</span>
                  </div>
                </div>
              ))}
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2 border border-dashed border-pink-300 text-pink-600 font-semibold rounded-xl text-xs hover:bg-pink-50 transition-colors nodrag"
              >
                + Adicionar Integração
              </button>
            </div>
          )}
        </div>

        {/* Porta de Saída (Right Handle) */}
        <Handle
          type="source"
          id="default"
          position={Position.Right}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-2"
        />
      </div>
    );
  }

  const isWaitKind = kind === "wait" || kind === "smart_delay";

  if (isWaitKind) {
    const delayTab = (data.delayTab as string) || "delay";
    const delayAmount = (data.delayAmount as number) ?? (data.seconds as number) ?? 0;
    const delayUnit = (data.delayUnit as string) || "Minutos";
    const targetDateTime = (data.targetDateTime as string) || "";

    const hasValue = delayTab === "datetime" ? Boolean(targetDateTime) : delayAmount > 0;

    return (
      <div
        className={`w-80 rounded-2xl border-2 border-orange-300 bg-white shadow-md transition-all font-sans relative ${
          selected ? "ring-2 ring-orange-500 shadow-xl border-orange-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        />

        {/* Header do Card Atraso Inteligente */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-orange-50/80 border-b border-orange-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-orange-500 text-white shadow-sm">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-orange-950">Atraso inteligente</span>
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

        {/* Body do Card Atraso Inteligente */}
        <div className="p-3 space-y-2.5">
          <p className="text-xs text-gray-500 font-medium">
            Definir o tempo de espera antes da próxima etapa
          </p>

          <button
            onClick={() => selectNode(nodeId)}
            className="w-full py-3 border-2 border-dashed border-orange-200 bg-orange-50/30 hover:bg-orange-50 text-orange-600 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 nodrag"
          >
            {hasValue
              ? delayTab === "datetime"
                ? `⏳ Até ${targetDateTime}`
                : `⏳ Aguardar ${delayAmount} ${delayUnit}`
              : "Adicionar atraso"}
          </button>
        </div>

        {/* Porta de Saída (Right Handle) */}
        <Handle
          type="source"
          id="default"
          position={Position.Right}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-2"
        />
      </div>
    );
  }

  const isRandomizerKind = kind === "randomizer" || kind === "split";

  if (isRandomizerKind) {
    const selectionType = (data.selectionType as string) || "random";
    const options = (data.options as Array<{ id: string; label: string; percentage?: number; handleId?: string }>) || [];

    return (
      <div
        className={`w-80 rounded-2xl border-2 border-cyan-200 bg-white shadow-md transition-all font-sans relative ${
          selected ? "ring-2 ring-cyan-500 shadow-xl border-cyan-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        />

        {/* Header do Card Randomizador */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-cyan-50 border-b border-cyan-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-cyan-500 text-white shadow-sm">
              <Shuffle className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-cyan-950">Randomizador</span>
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

        {/* Body do Card Randomizador */}
        <div className="p-3 space-y-2.5">
          {options.length < 2 ? (
            <>
              <p className="text-xs text-gray-500 font-medium">Adicione pelo menos duas opções</p>
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-3 border-2 border-dashed border-cyan-200 bg-cyan-50/40 hover:bg-cyan-50 text-cyan-600 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 nodrag"
              >
                Adicionar opção
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {options.map((opt, idx) => {
                const handleId = opt.handleId || `opt_${opt.id || idx}`;
                return (
                  <div
                    key={opt.id || idx}
                    className="p-2.5 bg-cyan-50/60 border border-cyan-100 rounded-xl text-xs font-semibold text-cyan-900 flex items-center justify-between relative"
                  >
                    <span>{opt.label || `Opção ${idx + 1}`}</span>
                    {selectionType === "random" && (
                      <span className="text-[11px] font-bold text-cyan-600 mr-3">
                        {opt.percentage ?? Math.round(100 / options.length)}%
                      </span>
                    )}
                    <Handle
                      type="source"
                      id={handleId}
                      position={Position.Right}
                      className="!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-4"
                    />
                  </div>
                );
              })}
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2 border border-dashed border-cyan-300 text-cyan-600 font-semibold rounded-xl text-xs hover:bg-cyan-50 transition-colors nodrag"
              >
                + Adicionar opção
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isFlowConnectionKind = kind === "subflow" || kind === "flow_connection";

  if (isFlowConnectionKind) {
    const targetFlowName = (data.targetFlowName as string) || (data.flowName as string) || "";

    return (
      <div
        className={`w-80 rounded-2xl border-2 border-emerald-200 bg-white shadow-md transition-all font-sans relative ${
          selected ? "ring-2 ring-emerald-500 shadow-xl border-emerald-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        />

        {/* Header do Card Conexão de Fluxo */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-emerald-500 text-white shadow-sm">
              <Rocket className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-emerald-950">Conexão de Fluxo</span>
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

        {/* Body do Card Conexão de Fluxo */}
        <div className="p-3 space-y-2.5">
          <p className="text-xs text-gray-500 font-medium">
            Selecione o fluxo que será iniciado após a ação anterior
          </p>

          <button
            onClick={() => selectNode(nodeId)}
            className="w-full py-3 border-2 border-dashed border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-600 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 nodrag"
          >
            {targetFlowName ? `▶ ${targetFlowName}` : "Selecionar Fluxo"}
          </button>
        </div>
      </div>
    );
  }

  const isConditionKind = kind === "condition";

  if (isConditionKind) {
    const matchRule = (data.matchRule as string) || "any";
    const conditions = (data.conditions as Array<{ id: string; label: string; operator?: string; value?: string }>) || [];
    const logicLabel = matchRule === "all" ? "Lógica E" : "Lógica Ou";

    return (
      <div
        className={`w-80 rounded-2xl border-2 border-blue-200 bg-white shadow-md transition-all font-sans relative ${
          selected ? "ring-2 ring-blue-500 shadow-xl border-blue-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        />

        {/* Header do Card Condição */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-blue-500 text-white shadow-sm">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-blue-950">Condição</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-600">{logicLabel}</span>
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
        </div>

        {/* Body do Card Condição */}
        <div className="p-3 space-y-2.5">
          {conditions.length === 0 ? (
            <>
              <p className="text-xs text-gray-500 font-medium">Adicione algum conteúdo para ver</p>
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-3 border-2 border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 text-blue-600 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 nodrag"
              >
                Adicionar condição
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {conditions.map((cond) => (
                <div
                  key={cond.id}
                  className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 flex items-center justify-between"
                >
                  <span className="font-semibold truncate">{cond.label}</span>
                </div>
              ))}
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2 border border-dashed border-blue-300 text-blue-600 font-semibold rounded-xl text-xs hover:bg-blue-50 transition-colors nodrag"
              >
                + Adicionar condição
              </button>
            </div>
          )}
        </div>

        {/* Portas de Saída (Verdadeiro / Falso) */}
        <div className="absolute right-0 top-1/3 -mr-2">
          <Handle
            type="source"
            id="true"
            position={Position.Right}
            className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
          />
        </div>
        <div className="absolute right-0 bottom-1/4 -mr-2">
          <Handle
            type="source"
            id="false"
            position={Position.Right}
            className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
          />
        </div>
      </div>
    );
  }

  if (isActionKind) {
    const actions = (data.actions as ContainerActionItem[]) || [];

    return (
      <div
        className={`w-80 rounded-2xl border-2 border-amber-200 bg-white shadow-md transition-all font-sans relative ${
          selected ? "ring-2 ring-amber-500 shadow-xl border-amber-500" : ""
        }`}
      >
        {/* Porta de Entrada (Left Handle) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        />

        {/* Header do Card Ação */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-amber-100/70 border-b border-amber-200">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-amber-500 text-white shadow-sm">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-amber-950">Ação</span>
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

        {/* Body do Card Ação */}
        <div className="p-3 space-y-2.5">
          <p className="text-xs text-gray-500 font-medium">Qual ação deve ser tomada?</p>

          {/* Lista de Ações Adicionadas */}
          {actions.length === 0 ? (
            <button
              onClick={() => selectNode(nodeId)}
              className="w-full py-3 border-2 border-dashed border-amber-200 bg-amber-50/40 hover:bg-amber-50 text-amber-700 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 nodrag"
            >
              Adicionar Ação
            </button>
          ) : (
            <div className="space-y-2">
              {actions.map((act) => (
                <div
                  key={act.id}
                  className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="font-semibold truncate">{act.label || act.type}</span>
                  </div>
                </div>
              ))}
              <button
                onClick={() => selectNode(nodeId)}
                className="w-full py-2 border border-dashed border-amber-300 text-amber-700 font-semibold rounded-xl text-xs hover:bg-amber-50 transition-colors nodrag"
              >
                + Adicionar Ação
              </button>
            </div>
          )}
        </div>

        {/* Porta de Saída (Right Handle) */}
        <Handle
          type="source"
          id="default"
          position={Position.Right}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform !-right-2"
        />
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
