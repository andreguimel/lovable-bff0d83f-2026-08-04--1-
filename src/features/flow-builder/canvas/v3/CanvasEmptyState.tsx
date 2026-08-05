/**
 * FB-13.4 — Empty State cinematográfico do canvas.
 *
 * Renderiza um "beacon" central quando o fluxo só tem o bloco Start
 * (ou está vazio). Não intercepta cliques nem drag — é overlay puro.
 * Some assim que o usuário arrasta o primeiro bloco.
 */
import { MousePointerClick, Sparkles, Zap } from "lucide-react";

export interface CanvasEmptyStateProps {
  visible: boolean;
}

export function CanvasEmptyState({ visible }: CanvasEmptyStateProps) {
  if (!visible) return null;
  return (
    <div className="fbv3-empty" aria-hidden>
      <div className="fbv3-empty__stage">
        <div className="fbv3-empty__ring fbv3-empty__ring--1" />
        <div className="fbv3-empty__ring fbv3-empty__ring--2" />
        <div className="fbv3-empty__ring fbv3-empty__ring--3" />
        <div className="fbv3-empty__core">
          <Zap className="h-6 w-6" />
        </div>
      </div>
      <div className="fbv3-empty__copy">
        <p className="fbv3-empty__eyebrow">
          <Sparkles className="h-3 w-3" />
          Flow Builder
        </p>
        <h2 className="fbv3-empty__title">Seu fluxo começa aqui.</h2>
        <p className="fbv3-empty__desc">
          Arraste um bloco da biblioteca <span>→</span> ou clique no{" "}
          <kbd>+</kbd> ao lado do <b>Início</b> para escolher o próximo passo.
        </p>
        <div className="fbv3-empty__hint">
          <MousePointerClick className="h-3.5 w-3.5" />
          <span>Dica: use <kbd>⌘K</kbd> para abrir a paleta rápida.</span>
        </div>
      </div>
    </div>
  );
}
