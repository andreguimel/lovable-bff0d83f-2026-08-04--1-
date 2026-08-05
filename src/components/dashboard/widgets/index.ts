import { lazy } from "react";
import {
  Bot,
  BellRing,
  LayoutGrid,
  LineChart,
  MessagesSquare,
  ShieldCheck,
  Users,
  Workflow,
  Zap,
  Send,
} from "lucide-react";

import { registerWidget, type WidgetDefinition } from "@/lib/dashboard/widget-registry";
import { P } from "@/lib/rbac/registry";

// Lazy-load todos os componentes para code-splitting real por widget
const KpiRowWidget = lazy(() => import("./kpi-row"));
const InboxLiveWidget = lazy(() => import("./inbox-live"));
const ActivityTimelineWidget = lazy(() => import("./activity-timeline"));
const GuardianHealthWidget = lazy(() => import("./guardian-health"));
const AiSummaryWidget = lazy(() => import("./ai-summary"));

export const WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  {
    id: "kpi-row",
    title: "Visão geral",
    description: "KPIs em tempo real",
    category: "overview",
    order: 10,
    permission: P.INBOX.VIEW,
    refresh: { kind: "poll", intervalMs: 60_000 },
    size: { w: 12, h: 4, minH: 3, maxH: 5 },
    resizable: false,
    movable: true,
    component: KpiRowWidget as unknown as WidgetDefinition["component"],
  },
  {
    id: "ai-summary",
    title: "Resumo inteligente",
    description: "IA analisa seu dia",
    category: "ai",
    order: 15,
    refresh: { kind: "manual" },
    size: { w: 8, h: 4, minH: 3 },
    experimental: true,
    component: AiSummaryWidget as unknown as WidgetDefinition["component"],
  },
  {
    id: "guardian-health",
    title: "Guardião",
    description: "Saúde do sistema",
    category: "system",
    order: 20,
    permission: P.GUARDIAN.VIEW,
    refresh: { kind: "realtime", tables: ["guardian_incidents"] },
    size: { w: 4, h: 4, minH: 3 },
    component: GuardianHealthWidget as unknown as WidgetDefinition["component"],
  },
  {
    id: "inbox-live",
    title: "Inbox ao vivo",
    description: "Conversas aguardando",
    category: "operations",
    order: 30,
    permission: P.INBOX.VIEW,
    refresh: { kind: "realtime", tables: ["conversations", "messages"] },
    size: { w: 6, h: 6, minH: 4 },
    component: InboxLiveWidget as unknown as WidgetDefinition["component"],
  },
  {
    id: "activity-timeline",
    title: "Centro de atividade",
    description: "Últimos eventos da plataforma",
    category: "operations",
    order: 40,
    refresh: { kind: "realtime", tables: ["domain_events"] },
    size: { w: 6, h: 6, minH: 4 },
    component: ActivityTimelineWidget as unknown as WidgetDefinition["component"],
  },
];

let bootstrapped = false;
export function bootstrapWidgets() {
  if (bootstrapped) return;
  bootstrapped = true;
  for (const w of WIDGET_DEFINITIONS) registerWidget(w);
}

// Ícones exportados para uso no palette/composer
export const WIDGET_ICONS: Record<string, typeof LayoutGrid> = {
  "kpi-row": LineChart,
  "ai-summary": Bot,
  "guardian-health": ShieldCheck,
  "inbox-live": MessagesSquare,
  "activity-timeline": BellRing,
  crm: Users,
  flows: Workflow,
  campaigns: Send,
  cascades: Zap,
};
