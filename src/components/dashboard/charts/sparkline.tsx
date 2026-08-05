import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * SVG Sparkline puro — 0 dependências, ~1kb, animado.
 * Passar valores normalizados ou brutos. Alturas fixas para layout previsível.
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  strokeWidth = 1.5,
  colorVar = "--color-primary",
  fill = true,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  colorVar?: string;
  fill?: boolean;
  className?: string;
}) {
  if (!data.length) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(" ");
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;

  const gradId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      role="img"
      aria-hidden
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(${colorVar})`} stopOpacity="0.25" />
              <stop offset="100%" stopColor={`var(${colorVar})`} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={area}
            fill={`url(#${gradId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
          />
        </>
      )}
      <motion.path
        d={path}
        fill="none"
        stroke={`var(${colorVar})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </svg>
  );
}
