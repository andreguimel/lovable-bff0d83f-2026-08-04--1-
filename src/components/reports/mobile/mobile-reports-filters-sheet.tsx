import { useState } from "react";
import { Filter } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PERIODS = [
  { id: 7, label: "7 dias" },
  { id: 30, label: "30 dias" },
  { id: 90, label: "90 dias" },
  { id: 180, label: "180 dias" },
] as const;

const STATUSES = [
  { id: "all", label: "Todos" },
  { id: "open", label: "Abertas" },
  { id: "pending", label: "Pendentes" },
  { id: "resolved", label: "Resolvidas" },
] as const;

/**
 * Bottom-sheet filter panel for mobile reports.
 * Presentation only — every value is a local state passed back on Apply.
 * `allowedPeriods` restricts which chips render (broadcasts/cascades use
 * 30/90/180; conversations uses 7/30/90).
 */
export function MobileReportsFiltersSheet({
  open,
  onOpenChange,
  days,
  onDaysChange,
  allowedPeriods,
  status,
  onStatusChange,
  search,
  onSearchChange,
  onClear,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  days: number;
  onDaysChange: (d: number) => void;
  allowedPeriods: readonly number[];
  status?: string;
  onStatusChange?: (s: string) => void;
  search?: string;
  onSearchChange?: (s: string) => void;
  onClear?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/60 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 font-display">
            <Filter className="h-4 w-4" /> Filtros
          </SheetTitle>
          <SheetDescription>
            Ajuste período, status e busca. As alterações aplicam ao vivo.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {onSearchChange ? (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Buscar
              </div>
              <Input
                value={search ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Contato, telefone ou mensagem"
                className="h-11 rounded-xl"
              />
            </div>
          ) : null}

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Período
            </div>
            <div className="flex flex-wrap gap-2">
              {PERIODS.filter((p) => allowedPeriods.includes(p.id)).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onDaysChange(p.id)}
                  className={`h-11 rounded-full px-4 text-sm font-medium ${
                    days === p.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {onStatusChange ? (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onStatusChange(s.id)}
                    className={`h-11 rounded-full px-4 text-sm font-medium ${
                      status === s.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex gap-2">
          {onClear ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-full"
              onClick={onClear}
            >
              Limpar
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-11 flex-1 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Small hook to keep filter-sheet open state co-located with the caller.
 * Exported for convenience in each report screen.
 */
export function useFiltersSheet() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
