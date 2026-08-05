/**
 * Feature Registry — catálogo declarativo de features da plataforma.
 * Cada módulo se registra aqui. `/settings/features` renderiza a matriz.
 */

export type FeatureStatus = "experimental" | "beta" | "stable" | "deprecated" | "removed";

export interface FeatureSpec {
  key: string;
  name: string;
  description: string;
  module: string;
  version: string;
  status: FeatureStatus;
  permission?: string;
  featureFlag?: string;
  dependsOn?: string[];
  since?: string;
}

export const FEATURES: FeatureSpec[] = [
  {
    key: "inbox",
    name: "Inbox",
    description: "Central de conversas multi-canal.",
    module: "inbox",
    version: "2.0",
    status: "stable",
    permission: "inbox.read",
  },
  {
    key: "crm",
    name: "CRM",
    description: "Contatos, tarefas, notas e funil.",
    module: "crm",
    version: "2.0",
    status: "stable",
    permission: "crm.read",
  },
  {
    key: "flows",
    name: "Fluxos",
    description: "Automação visual com Flow Engine.",
    module: "flows",
    version: "1.5",
    status: "stable",
    permission: "flows.read",
  },
  {
    key: "agents",
    name: "Agentes IA",
    description: "Agentes autônomos com AI Gateway.",
    module: "agents",
    version: "1.2",
    status: "beta",
    permission: "agents.read",
  },
  {
    key: "guardian",
    name: "Guardião",
    description: "Monitor de saúde e incidentes.",
    module: "guardian",
    version: "1.0",
    status: "beta",
    permission: "guardian.read",
  },
  {
    key: "team",
    name: "Equipe",
    description: "Gestão de membros, cargos, permissões.",
    module: "team",
    version: "2.0",
    status: "stable",
    permission: "team.read",
  },
  {
    key: "campaigns",
    name: "Campanhas",
    description: "Broadcasts segmentados.",
    module: "campaigns",
    version: "1.1",
    status: "stable",
    permission: "campaigns.read",
  },
  {
    key: "cascades",
    name: "Cascatas",
    description: "Políticas de fallback multi-canal.",
    module: "cascades",
    version: "1.0",
    status: "beta",
    permission: "cascades.read",
  },
  {
    key: "quick-replies",
    name: "Mensagens Rápidas",
    description: "Templates reutilizáveis.",
    module: "quick-replies",
    version: "1.0",
    status: "stable",
    permission: "inbox.read",
  },
  {
    key: "channels",
    name: "Canais",
    description: "Integrações de canais externos.",
    module: "channels",
    version: "1.2",
    status: "stable",
    permission: "channels.read",
  },
  {
    key: "settings",
    name: "Ajustes",
    description: "Configurações da empresa e conta.",
    module: "settings",
    version: "2.0",
    status: "stable",
  },
  {
    key: "reports",
    name: "Relatórios",
    description: "Analytics de conversas, campanhas, cascatas.",
    module: "reports",
    version: "1.1",
    status: "stable",
    permission: "reports.read",
  },
  {
    key: "dashboard",
    name: "Dashboard",
    description: "Visão geral premium com widgets.",
    module: "dashboard",
    version: "2.0",
    status: "beta",
  },
  {
    key: "feature-flags",
    name: "Feature Flags",
    description: "Rollout controlado de features.",
    module: "settings",
    version: "1.0",
    status: "stable",
    permission: "settings.write",
  },
  {
    key: "rbac",
    name: "RBAC",
    description: "Matriz de permissões granular.",
    module: "settings",
    version: "1.0",
    status: "stable",
    permission: "settings.write",
  },
];

export function listFeatures(): FeatureSpec[] {
  return FEATURES;
}

/** Verifica se uma feature está habilitada. Consulta `feature_flags` quando `featureFlag` está declarada. */
export async function isFeatureEnabled(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: string,
        ) => { maybeSingle: () => Promise<{ data: { enabled?: boolean } | null }> };
      };
    };
  },
  key: string,
): Promise<boolean> {
  const spec = FEATURES.find((f) => f.key === key || f.featureFlag === key);
  if (!spec) return false;
  if (spec.status === "removed") return false;
  if (!spec.featureFlag) return spec.status !== "experimental";
  const { data } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", spec.featureFlag)
    .maybeSingle();
  return Boolean(data?.enabled);
}
