import type { ComponentType, LazyExoticComponent } from "react";
import type { PermissionKey } from "@/lib/rbac/registry";

/**
 * Widget Registry — fonte única de verdade para todos os widgets do Dashboard.
 *
 * Cada widget declara seu contrato (query, realtime, permissão, dimensões,
 * refresh). Adicionar um widget novo = adicionar uma entrada aqui + criar o
 * componente. Nunca renderizar widgets fora do registry.
 */

export type WidgetCategory =
  | "overview"
  | "operations"
  | "growth"
  | "ai"
  | "system";

export type WidgetSize = {
  /** grid columns (12-col grid) at each breakpoint */
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
};

export type WidgetRefreshPolicy =
  | { kind: "realtime"; tables: string[] }
  | { kind: "poll"; intervalMs: number }
  | { kind: "manual" };

export type WidgetDefinition = {
  id: string;
  title: string;
  description?: string;
  category: WidgetCategory;
  order: number;
  /** RBAC key required to render the widget */
  permission?: PermissionKey | string;
  /** Feature flag key to gate the widget behind (optional) */
  featureFlag?: string;
  /** Refresh policy — realtime, poll, manual */
  refresh: WidgetRefreshPolicy;
  /** Default size in the responsive grid */
  size: WidgetSize;
  resizable?: boolean;
  movable?: boolean;
  hidden?: boolean;
  experimental?: boolean;
  /** Lazy-loaded component. Never eager. */
  component: LazyExoticComponent<ComponentType<Record<string, never>>>;
};

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(def: WidgetDefinition) {
  if (registry.has(def.id)) {
    // Ignora re-registro em HMR
    registry.set(def.id, def);
    return;
  }
  registry.set(def.id, def);
}

export function getWidget(id: string): WidgetDefinition | undefined {
  return registry.get(id);
}

export function listWidgets(): WidgetDefinition[] {
  return Array.from(registry.values()).sort((a, b) => a.order - b.order);
}

export function listWidgetsByCategory(cat: WidgetCategory): WidgetDefinition[] {
  return listWidgets().filter((w) => w.category === cat);
}
