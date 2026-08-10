import { createContext, useContext, useState, ReactNode } from "react";

export const RANGES = [
  { key: "today", label: "Hoje", days: 1 },
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
  { key: "qtd", label: "Trimestre", days: 90 },
  { key: "all", label: "Tudo", days: 365 },
] as const;

export type DashboardRange = (typeof RANGES)[number]["key"];

export const RANGE_DAYS_MAP: Record<DashboardRange, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  qtd: 90,
  all: 365,
};

interface ContextValue {
  range: DashboardRange;
  days: number;
  setRange: (r: DashboardRange) => void;
}

const DashboardRangeContext = createContext<ContextValue>({
  range: "30d",
  days: 30,
  setRange: () => {},
});

export function DashboardRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DashboardRange>("30d");
  const days = RANGE_DAYS_MAP[range] ?? 30;

  return (
    <DashboardRangeContext.Provider value={{ range, days, setRange }}>
      {children}
    </DashboardRangeContext.Provider>
  );
}

export function useDashboardRange() {
  return useContext(DashboardRangeContext);
}
