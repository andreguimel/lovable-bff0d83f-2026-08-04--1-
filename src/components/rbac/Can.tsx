import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionKey } from "@/lib/rbac/registry";

interface CanProps {
  permission?: PermissionKey | string;
  anyOf?: (PermissionKey | string)[];
  allOf?: (PermissionKey | string)[];
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Consome a matriz RBAC central. NUNCA use strings soltas —
 * importe do registry: `import { P } from "@/lib/rbac/registry"`.
 */
export function Can({ permission, anyOf, allOf, fallback = null, children }: CanProps) {
  const { has, hasAny, hasAll, isPending } = usePermissions();
  if (isPending) return null;
  const ok = permission ? has(permission)
    : anyOf ? hasAny(anyOf)
    : allOf ? hasAll(allOf)
    : true;
  return <>{ok ? children : fallback}</>;
}
