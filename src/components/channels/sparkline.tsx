import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({ data, color = "hsl(var(--primary))" }: { data: { total: number }[]; color?: string }) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="total"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
