/**
 * FB-10.1 / FB-10.3 — BlockNodeV3
 *
 * NodeType do React Flow que renderiza um bloco no visual V3.
 * Depois da FB-10.3 cobre TODOS os kinds catalogados (17), não apenas
 * start/end. Kinds fora de V3_KINDS caem para o card V2 legado.
 *
 * Regras aplicadas:
 *  - Sub-rótulo do header vem SEMPRE de `displayKindLabel` (humano);
 *    nunca vaza kind técnico como "send_audio" ou "http_request".
 *  - Corpo usa o preview rico do Registry (FB-06) quando existe;
 *    quando o bloco ainda não foi configurado, cai em texto humano
 *    (`emptyBodyText`) que orienta a ação — sem "BLOCO DESCONECTADO".
 *  - Multi-outputs (condition) ganham rótulos "Sim" / "Não"
 *    posicionados ao lado dos PillHandles.
 *  - Footer de conectividade só aparece em start/end para orientar
 *    a construção do fluxo — não polui os demais 15 cards.
 */
import { memo, useMemo, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Position, type NodeProps } from "@xyflow/react";
import { blockRegistry } from "../../blocks/registry";
import { BlockCardV3 } from "./BlockCardV3";
import { PillHandle } from "./PillHandle";
import { AddOnHandle } from "./AddOnHandle";
import {
  displayHandleLabel,
  displayKindLabel,
  displayTitle,
  resolveCategoryV3,
} from "./tokens";

interface V3Data extends Record<string, unknown> {
  __kind: string;
  __invalid?: boolean;
  __running?: boolean;
  __hasIncoming?: boolean;
  __hasOutgoing?: boolean;
  __outgoingHandles?: string[];
  __density?: "compact" | "detailed";
  label?: string;
}

/**
 * Fallback humano para preview quando o Registry ainda não devolveu
 * nada (bloco não configurado). Fica dentro do body do card.
 * Deve ser CURTO e orientar a ação — nunca uma acusação.
 */
const EMPTY_HINT: Record<string, string> = {
  message: "Escreva a mensagem que o contato vai receber.",
  question: "Escreva a pergunta que o contato deve responder.",
  menu: "Escreva a pergunta e adicione ao menos duas opções.",
  send_image: "Anexe a imagem que será enviada.",
  send_audio: "Anexe o áudio que será enviado.",
  send_video: "Anexe o vídeo que será enviado.",
  send_document: "Anexe o arquivo que será enviado.",
  wait: "Defina por quantos segundos o fluxo deve pausar.",
  wait_reply: "Pausa até o contato responder pelo canal.",
  condition: "Defina a regra para dividir o fluxo em Sim / Não.",
  ai: "Selecione o agente de IA que responderá.",
  transfer: "Encaminha o atendimento para uma pessoa.",
  assign_agent: "Defina o atendente responsável pela conversa.",
  tag: "Escolha a etiqueta que será aplicada ao contato.",
  http_request: "Informe a URL do endpoint a ser chamado.",
  webhook: "Informe a URL do webhook a ser notificado.",
};

function BlockNodeV3Inner(props: NodeProps) {
  const data = props.data as V3Data;
  const kind = data.__kind;
  const def = blockRegistry.get(kind);

  const preview = useMemo<string | null>(() => {
    if (!def?.preview) return null;
    try {
      return def.preview(data) ?? null;
    } catch {
      return null;
    }
  }, [def, data]);

  const invalid = useMemo(() => {
    if (data.__invalid !== undefined) return Boolean(data.__invalid);
    if (!def?.validate) return false;
    try {
      return !def.validate(data).valid;
    } catch {
      return false;
    }
  }, [def, data]);

  if (!def) {
    return (
      <BlockCardV3
        category="system"
        icon={HelpCircle}
        title={data.label ?? kind}
        kindLabel="Bloco não reconhecido"
        emptyBodyText="Este bloco não faz parte da versão atual."
      />
    );
  }

  const meta = def.meta;
  const category = resolveCategoryV3(kind, meta.category);
  const title = displayTitle(kind, meta.label, data.label);
  const kindLabel = displayKindLabel(kind, meta.short ?? meta.label);

  // FB-10.4 — handles podem depender dos dados da instância (ex.: Menu).
  const runtimeHandles = def.getHandles ? def.getHandles(data) : meta.handles;
  const hasIn = runtimeHandles.in === 1;
  const outs = runtimeHandles.out;
  const hasIncoming = Boolean(data.__hasIncoming);
  const hasOutgoing = Boolean(data.__hasOutgoing);
  const outgoingHandles = new Set(data.__outgoingHandles ?? []);
  const multiOut = outs.length > 1;

  const handles: ReactNode = (
    <>
      {hasIn && (
        <PillHandle
          type="target"
          position={Position.Left}
          connected={hasIncoming}
        />
      )}
      {outs.length === 1 && (
        <AddOnHandle
          nodeId={props.id}
          type="source"
          position={Position.Right}
          id={outs[0].id}
          connected={outgoingHandles.has(outs[0].id ?? "default") || hasOutgoing}
        />
      )}
      {multiOut &&
        outs.map((h, i) => {
          const step = 1 / (outs.length + 1);
          const top = `${Math.round((i + 1) * step * 100)}%`;
          const label = displayHandleLabel(kind, h.id, h.label ?? undefined);
          return (
            <div key={h.id}>
              <AddOnHandle
                nodeId={props.id}
                type="source"
                position={Position.Right}
                id={h.id}
                connected={outgoingHandles.has(h.id)}
                style={{ top }}
              />
              {label ? (
                <span
                  className={
                    "fbv3-node__hlabel " +
                    (h.id === "true"
                      ? "fbv3-node__hlabel--yes"
                      : h.id === "false"
                        ? "fbv3-node__hlabel--no"
                        : "fbv3-node__hlabel--neutral")
                  }
                  style={{ top: `calc(${top} - 10px)` }}
                >
                  {label}
                </span>
              ) : null}
            </div>
          );
        })}
    </>
  );

  // Corpo — preview rico do Registry; fallback humano quando vazio.
  const body: ReactNode = preview;
  const emptyBodyText =
    kind === "start"
      ? "Ponto de partida da conversa. Conecte ao primeiro bloco."
      : kind === "end"
        ? "A automação termina aqui."
        : (EMPTY_HINT[kind] ?? "Clique para configurar este bloco.");

  // Rodapé — usado apenas em start/end para orientar conectividade.
  // Os demais 15 kinds NÃO exibem footer permanente para evitar poluição
  // e o efeito "BLOCO DESCONECTADO" replicado em cada peça.
  let footer: ReactNode = null;
  if (kind === "start") {
    footer = hasOutgoing
      ? "Fluxo iniciado"
      : "Conecte a saída ao primeiro passo do fluxo.";
  } else if (kind === "end") {
    footer = hasIncoming ? "Fim configurado" : "Ligue um bloco anterior à entrada.";
  } else if (multiOut) {
    // Bloco de decisão — reforça a leitura das saídas.
    footer = "Escolha a saída para cada resposta.";
  }

  return (
    <BlockCardV3
      category={category}
      kind={kind}
      icon={meta.icon}
      title={title}
      kindLabel={kindLabel}
      body={body}
      emptyBodyText={emptyBodyText}
      footer={footer}
      selected={Boolean(props.selected)}
      invalid={invalid}
      running={Boolean(data.__running)}
      density={data.__density ?? "detailed"}
      handles={handles}
    />
  );
}

export const BlockNodeV3 = memo(BlockNodeV3Inner);
