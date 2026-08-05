import { LayoutDashboard, MessageSquare, Activity, CheckSquare, Sparkles, Edit3, Radio, CalendarClock, BarChart3 } from "lucide-react";

export const TABS = [
  { key: "overview", label: "Visão Geral", icon: LayoutDashboard },
  { key: "edit", label: "Editar", icon: Edit3 },
  { key: "conversations", label: "Conversas", icon: MessageSquare },
  { key: "activities", label: "Atividades", icon: Activity },
  { key: "tasks", label: "Tarefas", icon: CheckSquare },
  { key: "ai", label: "IA", icon: Sparkles },
  { key: "channels", label: "Canais", icon: Radio },
  { key: "schedule", label: "Agenda", icon: CalendarClock },
  { key: "stats", label: "Estatísticas", icon: BarChart3 },
];

export function TabsNav({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="studio-tabs-nav">
      {TABS.map((t) => (
        <button key={t.key} className="studio-tab-btn" data-active={value === t.key} onClick={() => onChange(t.key)}>
          <t.icon className="h-3.5 w-3.5" />
          {t.label}
        </button>
      ))}
    </div>
  );
}
