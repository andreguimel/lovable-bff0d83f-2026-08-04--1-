import { cn } from "@/lib/utils";

export function scoreLabel(score: number): {
  label: string;
  tone: "excellent" | "good" | "warm" | "cold" | "lost";
} {
  if (score >= 80) return { label: "Excelente", tone: "excellent" };
  if (score >= 60) return { label: "Bom", tone: "good" };
  if (score >= 40) return { label: "Morno", tone: "warm" };
  if (score >= 20) return { label: "Frio", tone: "cold" };
  return { label: "Perdido", tone: "lost" };
}

const toneClasses: Record<string, string> = {
  excellent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  good: "bg-primary/15 text-primary",
  warm: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cold: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  lost: "bg-muted text-muted-foreground",
};

export function LeadScorePill({ score, className }: { score: number; className?: string }) {
  const { label, tone } = scoreLabel(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        toneClasses[tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label} · {score}
    </span>
  );
}

export function LeadScoreBar({ score }: { score: number }) {
  const { tone } = scoreLabel(score);
  const barColor: Record<string, string> = {
    excellent: "bg-emerald-500",
    good: "bg-primary",
    warm: "bg-amber-500",
    cold: "bg-sky-500",
    lost: "bg-muted-foreground/50",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", barColor[tone])}
        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
      />
    </div>
  );
}
