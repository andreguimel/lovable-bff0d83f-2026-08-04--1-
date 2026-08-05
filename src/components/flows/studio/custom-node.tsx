import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BLOCKS, type NodeKind } from "./blocks";

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
  __selected?: boolean;
  __invalid?: boolean;
  __running?: boolean;
}

function preview(kind: NodeKind, data: FlowNodeData): string | null {
  switch (kind) {
    case "message":
    case "question":
      return typeof data.body === "string" && data.body ? data.body.slice(0, 90) : null;
    case "send_image":
    case "send_audio":
    case "send_video":
    case "send_document":
      return typeof data.media_filename === "string"
        ? data.media_filename
        : data.media_url
          ? "Mídia anexada"
          : "Nenhuma mídia";
    case "wait":
      return typeof data.seconds === "number" && data.seconds > 0
        ? `${data.seconds}s`
        : "sem tempo";
    case "condition":
      return typeof data.expression === "string" && data.expression
        ? data.expression
        : "sem expressão";
    case "http_request":
      return `${data.method ?? "GET"} ${data.url ?? ""}`.trim();
    case "webhook":
      return typeof data.url === "string" ? data.url : "sem URL";
    case "tag":
      return typeof data.tag === "string" ? `#${data.tag}` : "sem tag";
    default:
      return null;
  }
}

function isInvalid(kind: NodeKind, data: FlowNodeData): boolean {
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

      <div className="flow-node__header">
        <span className="flow-node__icon">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flow-node__titles">
          <p className="flow-node__title">{data.label || meta.label}</p>
          <p className="flow-node__kind">{meta.label}</p>
        </div>
      </div>

      {p && (
        <p className="flow-node__body" title={p}>
          {p}
        </p>
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
      ) : meta.outputs === 0 ? null : (
        <Handle type="source" position={Position.Right} className="flow-handle" />
      )}
    </div>
  );
}

export const FlowNode = memo(FlowNodeInner);
