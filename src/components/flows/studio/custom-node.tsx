import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronUp, Layers, Plus } from "lucide-react";
import { BLOCKS, type NodeKind } from "./blocks";

export interface ButtonItem {
  id: string;
  label: string;
}

export type ConditionType =
  | "tag"
  | "weekday"
  | "business_hours"
  | "time_window"
  | "assigned_agent"
  | "custom_field";

export interface ConditionRule {
  id: string;
  type: ConditionType;
  label?: string;
  tag_name?: string;
  tag_operator?: "has" | "has_not";
  weekdays?: number[];
  business_hours_operator?: "open" | "closed";
  start_time?: string;
  end_time?: string;
  agent_user_id?: string;
  agent_user_name?: string;
  field?: string;
  operator?: string;
  value?: string;
}

export interface ActionItem {
  id: string;
  kind: NodeKind;
  label?: string;
  body?: string;
  caption?: string;
  seconds?: number;
  agent_id?: string;
  tag?: string;
  url?: string;
  method?: string;
  media_url?: string;
  media_filename?: string;
  media_mime?: string;
  media_size?: number;
  is_voice?: boolean;
  is_typing?: boolean;
  buttons?: ButtonItem[];
}

export interface FlowNodeData extends Record<string, unknown> {
  __kind: NodeKind;
  label?: string;
  body?: string;
  caption?: string;
  seconds?: number;
  agent_id?: string;
  tag?: string;
  url?: string;
  method?: string;
  expression?: string;
  media_url?: string;
  media_filename?: string;
  media_mime?: string;
  media_size?: number;
  is_voice?: boolean;
  is_typing?: boolean;
  logic?: "ALL" | "ANY";
  conditions?: ConditionRule[];
  actions?: ActionItem[];
  buttons?: ButtonItem[];
  __selected?: boolean;
  __invalid?: boolean;
  __running?: boolean;
}

export function previewRule(rule: ConditionRule): string {
  switch (rule.type) {
    case "tag":
      return `Etiqueta ${rule.tag_operator === "has_not" ? "NÃO é" : "É"} #${rule.tag_name || "..."}`;
    case "weekday":
      return `Dia da Semana ao passar por aqui`;
    case "business_hours":
      return `Horário de Atendimento É ${rule.business_hours_operator === "closed" ? "Fechado" : "Aberto"}`;
    case "time_window":
      return `Hora entre ${rule.start_time || "08:00"} e ${rule.end_time || "18:00"}`;
    case "assigned_agent":
      return `Atendimento atribuído a ${rule.agent_user_name || "Atendente"}`;
    case "custom_field":
    default:
      return `${rule.field || "Campo"} ${rule.operator || "é igual a"} ${rule.value || ""}`;
  }
}

function preview(kind: NodeKind, data: Record<string, unknown>): string | null {
  switch (kind) {
    case "message":
    case "question":
      return typeof data.body === "string" && data.body ? data.body.slice(0, 90) : null;
    case "send_image":
      return typeof data.media_filename === "string"
        ? `Imagem: ${data.media_filename}`
        : data.media_url
          ? "Imagem anexada"
          : "Nenhuma imagem selecionada";
    case "send_audio":
      return typeof data.media_filename === "string"
        ? `Áudio: ${data.media_filename}`
        : data.media_url
          ? data.is_voice
            ? "Áudio de voz (PTT)"
            : "Áudio anexado"
          : "Nenhum áudio selecionado";
    case "send_video":
      return typeof data.media_filename === "string"
        ? `Vídeo: ${data.media_filename}`
        : data.media_url
          ? "Vídeo anexado"
          : "Nenhum vídeo selecionado";
    case "send_document":
      return typeof data.media_filename === "string"
        ? `Arquivo: ${data.media_filename}`
        : data.media_url
          ? "Arquivo anexado"
          : "Nenhum arquivo selecionado";
    case "wait":
      return typeof data.seconds === "number" && data.seconds > 0
        ? `Aguardar ${data.seconds}s${data.is_typing ? " (digitando...)" : ""}`
        : "sem tempo";
    case "wait_reply":
      return "Esperar resposta sem tempo definido";
    case "condition":
      if (Array.isArray(data.conditions) && data.conditions.length > 0) {
        const mode = data.logic === "ANY" ? "QUALQUER (OU)" : "TODAS (E)";
        return `Lógica ${mode} · ${data.conditions.length} condição(ões)`;
      }
      return typeof data.expression === "string" && data.expression
        ? data.expression
        : "sem expressão";
    case "http_request":
      return `${data.method ?? "GET"} ${data.url ?? ""}`.trim();
    case "webhook":
      return typeof data.url === "string" ? data.url : "sem URL";
    case "tag":
      return typeof data.tag === "string" ? `Tag #${data.tag}` : "sem tag";
    case "transfer": {
      const t = (data.target_type as string) ?? "queue";
      if (t === "agent" && data.agent_label) return `Atribuir a: ${data.agent_label}`;
      if (t === "department" && data.department) return `Equipe: ${data.department}`;
      return "Fila Geral (Inbox)";
    }
    default:
      return null;
  }
}

function isInvalid(kind: NodeKind, data: Record<string, unknown>): boolean {
  switch (kind) {
    case "message":
    case "question":
      return !data.body || String(data.body).trim().length === 0;
    case "send_image":
    case "send_audio":
    case "send_video":
    case "send_document":
      return !data.media_url;
    case "condition":
      return !data.expression;
    case "webhook":
    case "http_request":
      return !data.url;
    case "ai":
    case "assign_agent":
      return !data.agent_id;
    default:
      return false;
  }
}

function FlowNodeInner(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const kind = (data.__kind ?? "message") as NodeKind;
  const meta = BLOCKS[kind] ?? BLOCKS.message;
  const Icon = meta.icon;
  const p = preview(kind, data);
  const invalid = data.__invalid ?? isInvalid(kind, data);
  const isRunning = data.__running;
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const buttons = Array.isArray(data.buttons) ? data.buttons : [];
  const hasMultipleActions = actions.length > 0;
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={`flow-node ${props.selected ? "flow-node--selected" : ""} ${
        invalid ? "flow-node--invalid" : ""
      } ${isRunning ? "flow-node--running" : ""}`}
      style={{ ["--node-accent" as string]: meta.accent }}
      data-kind={kind}
    >
      {meta.inputs !== 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="flow-handle"
          isConnectable
        />
      )}

      <div className="flow-node__header flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="flow-node__icon">
            {hasMultipleActions ? <Layers className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
          </span>
          <div className="flow-node__titles">
            <p className="flow-node__title">
              {data.label || (hasMultipleActions ? `Bloco (${actions.length} ações)` : meta.label)}
            </p>
            <p className="flow-node__kind">
              {hasMultipleActions ? `${actions.length} funções sequenciais` : meta.label}
            </p>
          </div>
        </div>

        {hasMultipleActions && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-1 rounded text-muted-foreground hover:bg-muted/50"
            title={expanded ? "Recolher ações" : "Expandir ações"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {kind === "condition" && Array.isArray(data.conditions) && data.conditions.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border/40 pt-2 text-[10.5px]">
          <div className="flex items-center justify-between text-[9.5px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            <span>Lógica {data.logic === "ANY" ? "QUALQUER (OU)" : "TODAS (E)"}</span>
          </div>
          {data.conditions.map((c, i) => (
            <div key={c.id || i} className="p-1.5 rounded bg-background/60 border border-border/30 text-[10.5px] text-foreground font-medium truncate">
              • {previewRule(c)}
            </div>
          ))}
        </div>
      )}

      {hasMultipleActions ? (
        expanded ? (
          <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border/40 pt-2">
            {actions.map((act, idx) => {
              const actMeta = BLOCKS[act.kind] ?? BLOCKS.message;
              const ActIcon = actMeta.icon;
              const actPreview = preview(act.kind, act as unknown as Record<string, unknown>);
              return (
                <div
                  key={act.id || idx}
                  className="flex items-start gap-2 p-1.5 rounded bg-background/60 border border-border/30 text-[11px]"
                >
                  <span className="mt-0.5 text-xs text-muted-foreground font-mono">
                    {idx + 1}.
                  </span>
                  <span className="mt-0.5 text-primary">
                    <ActIcon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {act.label || actMeta.label}
                    </p>
                    {actPreview && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {actPreview}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="flow-node__body text-[10px] text-muted-foreground cursor-pointer">
            {actions.length} ações recolhidas. Clique para expandir.
          </p>
        )
      ) : (
        p && (
          <p className="flow-node__body" title={p}>
            {p}
          </p>
        )
      )}

      {/* RENDERIZAÇÃO DE BOTÕES DE RESPOSTA (BOTCONVERSA STYLE) */}
      {buttons.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-border/40 pt-2">
          <p className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider">
            Botões de Resposta ({buttons.length})
          </p>
          {buttons.map((btn, bIdx) => (
            <div
              key={btn.id || bIdx}
              className="flex items-center justify-between px-2 py-1 rounded bg-primary/10 border border-primary/30 text-[11px] font-medium text-primary"
            >
              <span className="truncate">🔘 {btn.label}</span>
            </div>
          ))}
        </div>
      )}

      {invalid && !isRunning && (
        <span className="flow-node__badge flow-node__badge--warn">
          <span className="flow-node__badge-dot" />
          configurar
        </span>
      )}
      {isRunning && (
        <span className="flow-node__badge flow-node__badge--run">
          <span className="flow-node__badge-dot" />
          executando
        </span>
      )}

      {meta.outputs === 2 ? (
        <>
          <Handle
            type="source"
            id="true"
            position={Position.Right}
            className="flow-handle flow-handle--yes"
            style={{ top: "60%" }}
          />
          <Handle
            type="source"
            id="false"
            position={Position.Right}
            className="flow-handle flow-handle--no"
            style={{ top: "85%" }}
          />
          <span className="flow-node__hlabel flow-node__hlabel--yes">sim</span>
          <span className="flow-node__hlabel flow-node__hlabel--no">não</span>
        </>
      ) : buttons.length > 0 ? (
        <>
          {buttons.map((btn, idx) => {
            const topPct = 50 + idx * 25;
            return (
              <div key={btn.id || idx}>
                <Handle
                  type="source"
                  id={`btn_${btn.id}`}
                  position={Position.Right}
                  className="flow-handle"
                  style={{ top: `${topPct}%` }}
                />
                <span
                  className="flow-node__hlabel text-[9px] font-medium text-primary"
                  style={{ top: `calc(${topPct}% - 8px)` }}
                >
                  {btn.label}
                </span>
              </div>
            );
          })}
        </>
      ) : meta.outputs === 0 ? null : (
        <Handle type="source" position={Position.Right} className="flow-handle" />
      )}
    </div>
  );
}

export const FlowNode = memo(FlowNodeInner);

