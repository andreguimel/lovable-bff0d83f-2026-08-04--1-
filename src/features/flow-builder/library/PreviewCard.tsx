/**
 * FB-05 — Card de pré-visualização de bloco.
 *
 * Mostra ícone, título, descrição, categoria e um exemplo de uso.
 * Usado tanto no sidebar (ao passar o mouse) quanto no Command Palette
 * (ao lado da lista). Não abre o SmartSidebar — é 100% informativo.
 */
import type { LibraryItem } from "./search";

interface Props {
  item: LibraryItem;
}

export function BlockPreviewCard({ item }: Props) {
  const Icon = item.def.meta.icon;
  const example = item.examples[0];
  return (
    <div
      className="fbv2-lib__preview"
      style={{ ["--card-accent" as string]: item.def.meta.accent }}
    >
      <div className="fbv2-lib__preview-head">
        <span className="fbv2-lib__preview-icon">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="fbv2-lib__preview-title">{item.def.meta.label}</p>
          <p className="fbv2-lib__preview-group">{item.group}</p>
        </div>
      </div>
      <p className="fbv2-lib__preview-desc">{item.def.meta.short}</p>
      {example && (
        <div className="fbv2-lib__preview-example">
          <span>Exemplo</span>
          <p>{example}</p>
        </div>
      )}
      {item.aliases.length > 0 && (
        <p className="fbv2-lib__preview-aliases">
          Também conhecido como {item.aliases.slice(0, 4).join(", ")}
        </p>
      )}
    </div>
  );
}
