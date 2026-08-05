/**
 * FB-05 — Empty state do canvas.
 *
 * Aparece quando o fluxo só possui o nó `start` (recém criado). Guia o
 * usuário para o primeiro passo — criar o segundo bloco — com botão
 * principal (abre o Command Palette) e dicas de atalhos.
 */
import { Plus, Sparkles } from "lucide-react";
import { useLibrary } from "./context";

interface Props {
  /** id do nó de origem para inserção conectada (normalmente o `start`). */
  originNodeId?: string | null;
}

export function EmptyState({ originNodeId }: Props) {
  const { openPalette } = useLibrary();
  return (
    <div className="fbv2-lib__empty-state" role="status">
      <div className="fbv2-lib__empty-card">
        <span className="fbv2-lib__empty-badge">
          <Sparkles className="h-4 w-4" />
        </span>
        <h3 className="fbv2-lib__empty-title">Comece adicionando seu primeiro bloco</h3>
        <p className="fbv2-lib__empty-desc">
          Descreva o que você quer que o fluxo faça: “enviar mensagem”, “fazer uma
          pergunta”, “chamar IA”, “transferir para atendimento”. A biblioteca encontra
          o bloco certo para você.
        </p>
        <button
          type="button"
          className="fbv2-lib__empty-cta"
          onClick={() =>
            openPalette({
              insertContext: originNodeId ? { sourceNodeId: originNodeId } : undefined,
            })
          }
        >
          <Plus className="h-4 w-4" />
          Adicionar bloco
          <kbd>⌘K</kbd>
        </button>
        <ul className="fbv2-lib__empty-tips">
          <li>
            <kbd>/</kbd> foca a busca da biblioteca lateral.
          </li>
          <li>
            <kbd>⌘K</kbd> abre a busca rápida em qualquer lugar.
          </li>
          <li>Arraste um bloco da lateral direto para o canvas.</li>
        </ul>
      </div>
    </div>
  );
}
