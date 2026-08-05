import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrendBadge({
  value,
  invertColor = false,
  suffix = "%",
  className,
}: {
  /** Delta percentual. Ex: 12 = +12%. */
  value: number;
  /** Quando `true`, valores negativos são positivos (ex.: latência). */
  invertColor?: boolean;
  suffix?: string;
  className?: string;
}) {
  const isUp = value > 0.01;
  const isDown = value < -0.01;
  const positive = invertColor ? isDown : isUp;
  const negative = invertColor ? isUp : isDown;
  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const tone = positive
    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
    : negative
      ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
      : "text-muted-foreground bg-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}
      {suffix}
    </span>
  );
}
