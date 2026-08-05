/**
 * FB-V1.2 · Smart Transition Delay — painel de propriedades da aresta.
 *
 * Renderiza no mesmo slot lateral do SmartSidebar quando uma edge está
 * selecionada. Permite configurar `transitionDelayMs` (atraso automático
 * aplicado pelo executor antes de disparar o próximo bloco).
 *
 * Complementa (não substitui) o bloco "Aguardar". Uso típico:
 *  - dar 500ms/1s entre mensagens para parecer natural;
 *  - agrupar delays curtos sem poluir o canvas.
 */
import { useEffect, useMemo, useState } from "react";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBuilderStore } from "../state/store";
import { useSelectedEdge } from "../state/selectors";

type Unit = "ms" | "s" | "m" | "h";

const UNIT_MS: Record<Unit, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

const MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function guessUnit(ms: number): Unit {
  if (ms === 0) return "s";
  if (ms % UNIT_MS.h === 0) return "h";
  if (ms % UNIT_MS.m === 0) return "m";
  if (ms % UNIT_MS.s === 0) return "s";
  return "ms";
}

function toDisplay(ms: number, unit: Unit): number {
  return Math.round((ms / UNIT_MS[unit]) * 1000) / 1000;
}

const PRESETS: Array<{ label: string; ms: number }> = [
  { label: "Sem atraso", ms: 0 },
  { label: "500 ms", ms: 500 },
  { label: "1 s", ms: 1000 },
  { label: "2 s", ms: 2000 },
  { label: "5 s", ms: 5000 },
  { label: "10 s", ms: 10_000 },
  { label: "30 s", ms: 30_000 },
  { label: "1 min", ms: 60_000 },
];

export function EdgePropertiesPanel() {
  const edge = useSelectedEdge();
  const setDelay = useBuilderStore((s) => s.setEdgeTransitionDelay);
  const disconnect = useBuilderStore((s) => s.disconnect);
  const selectEdge = useBuilderStore((s) => s.selectEdge);

  const currentMs = Math.max(0, edge?.transitionDelayMs ?? 0);
  const [unit, setUnit] = useState<Unit>(() => guessUnit(currentMs));
  const [value, setValue] = useState<string>(() => String(toDisplay(currentMs, guessUnit(currentMs))));

  // Sincroniza quando muda de edge selecionada.
  useEffect(() => {
    if (!edge) return;
    const u = guessUnit(edge.transitionDelayMs ?? 0);
    setUnit(u);
    setValue(String(toDisplay(edge.transitionDelayMs ?? 0, u)));
  }, [edge?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const computedMs = useMemo(() => {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(MAX_MS, Math.round(n * UNIT_MS[unit]));
  }, [value, unit]);

  if (!edge) return null;

  const commit = (ms: number) => {
    setDelay(edge.id, ms);
    const u = guessUnit(ms);
    setUnit(u);
    setValue(String(toDisplay(ms, u)));
  };

  return (
    <aside className="fbv2-sidebar" aria-label="Propriedades da conexão">
      <header className="fbv2-sidebar__header">
        <div className="flex items-center gap-2">
          <span className="fbv2-sidebar__icon" aria-hidden>
            <Clock className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <span className="fbv2-sidebar__title">Conexão</span>
            <span className="fbv2-sidebar__subtitle text-xs text-muted-foreground">
              Atraso automático entre blocos
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => selectEdge(null)}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="fbv2-sidebar__body space-y-5 p-4">
        <section className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Atraso na transição
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={unit === "ms" ? 50 : 1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => commit(computedMs)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <select
              value={unit}
              onChange={(e) => {
                const next = e.target.value as Unit;
                setUnit(next);
                // reinterpreta o valor visível para o novo unit sem mudar o ms atual
                setValue(String(toDisplay(currentMs, next)));
              }}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ms">ms</option>
              <option value="s">seg</option>
              <option value="m">min</option>
              <option value="h">h</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            O executor aguarda esse tempo depois do bloco de origem e antes do próximo.
            Não substitui o bloco &ldquo;Aguardar&rdquo; — use para pequenas pausas naturais.
          </p>
        </section>

        <section className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Atalhos
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => commit(p.ms)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  computedMs === p.ms
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Atraso atual</span>
            <span className="font-mono text-foreground">{computedMs} ms</span>
          </div>
        </section>

        <div className="flex justify-between gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              disconnect(edge.id);
            }}
          >
            Excluir conexão
          </Button>
          <Button size="sm" onClick={() => commit(computedMs)}>
            Aplicar
          </Button>
        </div>
      </div>
    </aside>
  );
}
