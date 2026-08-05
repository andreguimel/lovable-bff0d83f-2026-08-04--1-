/**
 * FB-10.1 — BlockCardV3
 *
 * Base estrutural definitiva dos futuros blocos do Flow Builder V3.
 * Suporta 3 slots:
 *   - header (ícone + título humano + kind + flag opcional)
 *   - body   (preview textual ou ReactNode; estado "sem configuração")
 *   - footer (status contextual, métricas futuras, próximo passo)
 *
 * Handles ficam fora deste componente — o Node é quem os coloca via
 * `handles` prop (React Flow exige que fiquem no wrapper posicional).
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import type { FlowCategoryV3 } from "./tokens";

export type BlockCardV3Density = "compact" | "detailed";

export interface BlockCardV3Props {
  category: FlowCategoryV3;
  /** Kind técnico do bloco — usado como seletor de acento (data-kind). */
  kind?: string;
  icon: LucideIcon;
  title: string;
  kindLabel: string;
  /** Conteúdo do body — string (preview) ou ReactNode. */
  body?: ReactNode;
  /** Texto exibido quando `body` é vazio e o bloco não requer configuração. */
  emptyBodyText?: string;
  /** Slot direito do header (badges, ações). */
  headerRight?: ReactNode;
  /** Slot de rodapé (status, métrica, hint). */
  footer?: ReactNode;
  /** Estado visual. */
  selected?: boolean;
  invalid?: boolean;
  running?: boolean;
  /** Densidade — "compact" oculta body/footer para caber mais nós no canvas. */
  density?: BlockCardV3Density;
  /** Handles do React Flow — devem ser filhos diretos do wrapper posicional. */
  handles?: ReactNode;
}

export function BlockCardV3({
  category,
  kind,
  icon: Icon,
  title,
  kindLabel,
  body,
  emptyBodyText,
  headerRight,
  footer,
  selected,
  invalid,
  running,
  density = "detailed",
  handles,
}: BlockCardV3Props) {
  const state = invalid ? "error" : "ok";
  const hasBody = body != null && body !== "";
  const isCompact = density === "compact";
  return (
    <motion.div
      className="fbv3-node"
      data-cat={category}
      data-kind={kind}
      data-selected={selected ? "true" : "false"}
      data-state={state}
      data-running={running ? "true" : "false"}
      data-density={density}
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.6 }}
      whileHover={{ y: -2, transition: { duration: 0.16 } }}
    >
      {selected ? <span className="fbv3-node__halo" aria-hidden /> : null}
      {handles}

      <header className="fbv3-node__header">
        <span className="fbv3-node__icon" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <div className="fbv3-node__titles">
          <p className="fbv3-node__title" title={title}>
            {title}
          </p>
          <p className="fbv3-node__kind">{kindLabel}</p>
        </div>
        {invalid && !running ? (
          <span className="fbv3-node__flag" title="Configuração pendente">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        ) : headerRight ? (
          <span className="fbv3-node__header-slot">{headerRight}</span>
        ) : null}
      </header>

      {!isCompact && (
        <div className="fbv3-node__body">
          {hasBody ? (
            typeof body === "string" ? <p>{body}</p> : body
          ) : emptyBodyText ? (
            <p className="fbv3-node__body-empty">{emptyBodyText}</p>
          ) : null}
        </div>
      )}

      {!isCompact && footer ? (
        <footer className="fbv3-node__footer">
          <span>
            <i className="fbv3-node__footer-dot" aria-hidden />
            {footer}
          </span>
        </footer>
      ) : null}
    </motion.div>
  );
}
