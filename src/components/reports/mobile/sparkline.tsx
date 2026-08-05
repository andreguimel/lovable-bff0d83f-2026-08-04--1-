/**
 * Tiny inline SVG sparkline / mini-bar helpers used across mobile
 * reports. Zero deps — pure presentation over pre-aggregated data
 * already returned by the existing report server functions.
 */
import { memo } from "react";

export const Sparkbars = memo(function Sparkbars({
  values,
  className,
  colorClass = "fill-primary",
  height = 32,
  gap = 2,
}: {
  values: number[];
  className?: string;
  colorClass?: string;
  height?: number;
  gap?: number;
}) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const width = 100;
  const barW = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height }}
      role="img"
      aria-hidden
    >
      {values.map((v, i) => {
        const h = (v / max) * (height - 2);
        const x = i * (barW + gap);
        const y = height - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={Math.max(1, h)}
            rx={1}
            className={colorClass}
          />
        );
      })}
    </svg>
  );
});

export const StackedBar = memo(function StackedBar({
  segments,
  className,
  height = 8,
}: {
  segments: Array<{ value: number; className: string; label?: string }>;
  className?: string;
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    return (
      <div
        className={`w-full overflow-hidden rounded-full bg-muted/60 ${className ?? ""}`}
        style={{ height }}
        aria-hidden
      />
    );
  }
  return (
    <div
      className={`flex w-full overflow-hidden rounded-full bg-muted/60 ${className ?? ""}`}
      style={{ height }}
      role="img"
      aria-label={segments.map((s) => `${s.label ?? ""} ${s.value}`).join(", ")}
    >
      {segments.map((s, i) => {
        const pct = (Math.max(0, s.value) / total) * 100;
        if (pct <= 0) return null;
        return (
          <div
            key={i}
            className={s.className}
            style={{ width: `${pct}%` }}
            title={s.label}
          />
        );
      })}
    </div>
  );
});
