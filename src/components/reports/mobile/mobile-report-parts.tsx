import type { ReactNode } from "react";

/**
 * Reusable mobile primitives for the Reports experience — filter chips
 * (horizontal, safe touch targets), KPI hero cards, empty / error /
 * offline states, mini icon-value pill. All presentation only.
 */

export function ChipRow<T extends string>({
  chips,
  value,
  onChange,
  ariaLabel,
}: {
  chips: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mx-4 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex gap-1.5 pb-1">
        {chips.map((c) => {
          const active = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(c.id)}
              className={`h-11 shrink-0 rounded-full px-4 text-xs font-semibold tracking-wide transition ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground active:bg-muted"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  spark,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  spark?: ReactNode;
}) {
  const toneRing: Record<string, string> = {
    default: "ring-border/60",
    primary: "ring-primary/30",
    success: "ring-emerald-500/25",
    warning: "ring-amber-500/25",
    danger: "ring-rose-500/25",
  };
  const toneText: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-rose-500",
  };
  return (
    <div
      className={`flex min-w-0 flex-col justify-between rounded-2xl bg-card/80 p-3 ring-1 ${toneRing[tone]} backdrop-blur`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${toneText[tone]}`}>
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
      {spark ? <div className="mt-2">{spark}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-card/40 px-6 py-12 text-center">
      {icon ? (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-destructive/40 bg-destructive/5 px-6 py-10 text-center">
      <h3 className="font-display text-base font-semibold text-destructive">
        Não foi possível carregar
      </h3>
      <p className="text-xs text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="h-11 rounded-full bg-destructive px-5 text-sm font-semibold text-destructive-foreground"
      >
        Tentar novamente
      </button>
    </div>
  );
}

export function OfflineHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
      Sem conexão. Exibindo dados em cache.
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-muted/40 ${className ?? "h-24 w-full"}`}
    />
  );
}
