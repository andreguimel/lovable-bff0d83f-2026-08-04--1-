/**
 * FB-03 — Node universal do React Flow.
 *
 * Um único componente é registrado como `NodeType`. Ele resolve o bloco
 * pelo Registry usando `data.__kind`. Zero switch por tipo aqui.
 * Presença/quantidade de portas vêm do meta do bloco.
 */
import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { blockRegistry } from "../blocks/registry";
import { BlockCard } from "./BlockCard";

export interface FBV2NodeData extends Record<string, unknown> {
  __kind: string;
  label?: string;
  __invalid?: boolean;
  __running?: boolean;
}

function BlockNodeInner(props: NodeProps) {
  const data = props.data as FBV2NodeData;
  const kind = (data?.__kind ?? "message") as string;
  const def = blockRegistry.get(kind);

  const meta = def?.meta;
  const preview = useMemo(() => {
    if (!def?.preview) return null;
    try {
      return def.preview(data);
    } catch {
      return null;
    }
  }, [def, data]);

  const invalid = useMemo(() => {
    if (data.__invalid !== undefined) return Boolean(data.__invalid);
    if (!def?.validate) return false;
    try {
      const r = def.validate(data);
      return !r.valid;
    } catch {
      return false;
    }
  }, [def, data]);

  if (!meta) {
    // Bloco desconhecido — ainda assim renderiza algo estável para não
    // quebrar fluxos legados que trouxeram um kind removido.
    return (
      <div className="fbv2-node fbv2-node--unknown">
        <Handle type="target" position={Position.Left} className="fbv2-handle" />
        <div className="fbv2-node__header">
          <div className="fbv2-node__titles">
            <p className="fbv2-node__title">{data.label ?? kind}</p>
            <p className="fbv2-node__kind">bloco desconhecido</p>
          </div>
        </div>
        <Handle type="source" position={Position.Right} className="fbv2-handle" />
      </div>
    );
  }

  const outs = meta.handles.out;
  const hasIn = meta.handles.in === 1;

  const ports = (
    <>
      {hasIn && (
        <Handle
          type="target"
          position={Position.Left}
          className="fbv2-handle fbv2-handle--in"
        />
      )}
      {outs.length === 1 && (
        <Handle
          type="source"
          id={outs[0].id}
          position={Position.Right}
          className="fbv2-handle fbv2-handle--out"
        />
      )}
      {outs.length > 1 &&
        outs.map((h, i) => {
          const step = 1 / (outs.length + 1);
          const top = `${Math.round((i + 1) * step * 100)}%`;
          const tone =
            h.id === "true"
              ? "fbv2-handle--yes"
              : h.id === "false"
                ? "fbv2-handle--no"
                : "fbv2-handle--out";
          return (
            <div key={h.id}>
              <Handle
                type="source"
                id={h.id}
                position={Position.Right}
                className={`fbv2-handle ${tone}`}
                style={{ top }}
              />
              {h.label ? (
                <span
                  className={`fbv2-node__hlabel ${
                    h.id === "true"
                      ? "fbv2-node__hlabel--yes"
                      : h.id === "false"
                        ? "fbv2-node__hlabel--no"
                        : ""
                  }`}
                  style={{ top: `calc(${top} - 8px)` }}
                >
                  {h.label}
                </span>
              ) : null}
            </div>
          );
        })}
    </>
  );

  return (
    <BlockCard
      icon={meta.icon}
      accent={meta.accent}
      title={data.label ? String(data.label) : meta.label}
      kindLabel={meta.label}
      preview={preview}
      selected={Boolean(props.selected)}
      invalid={invalid}
      running={Boolean(data.__running)}
      ports={ports}
    />
  );
}

export const BlockNode = memo(BlockNodeInner);
