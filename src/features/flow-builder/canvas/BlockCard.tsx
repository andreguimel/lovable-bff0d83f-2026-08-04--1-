/**
 * FB-03 — Card base único.
 *
 * Todos os Nodes nascem daqui. O bloco só personaliza:
 * cor, ícone, título, resumo e portas. Nada mais.
 * Layout: header + body + footer. Alinhamento e espaçamento idênticos.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";

export interface BlockCardProps {
  icon: LucideIcon;
  accent: string;
  title: string;
  kindLabel: string;
  preview?: string | null;
  selected: boolean;
  invalid: boolean;
  running: boolean;
  ports: ReactNode;
  footer?: ReactNode;
}

export function BlockCard({
  icon: Icon,
  accent,
  title,
  kindLabel,
  preview,
  selected,
  invalid,
  running,
  ports,
  footer,
}: BlockCardProps) {
  return (
    <div
      className={[
        "fbv2-node",
        selected ? "fbv2-node--selected" : "",
        invalid ? "fbv2-node--invalid" : "",
        running ? "fbv2-node--running" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--fbv2-accent" as string]: accent }}
    >
      {ports}

      <header className="fbv2-node__header">
        <span className="fbv2-node__icon" aria-hidden>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="fbv2-node__titles">
          <p className="fbv2-node__title" title={title}>
            {title}
          </p>
          <p className="fbv2-node__kind">{kindLabel}</p>
        </div>
        {invalid && !running && (
          <span className="fbv2-node__flag" title="Configurar">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </header>

      {preview ? (
        <p className="fbv2-node__body" title={preview}>
          {preview}
        </p>
      ) : null}

      {footer ? <footer className="fbv2-node__footer">{footer}</footer> : null}
    </div>
  );
}
