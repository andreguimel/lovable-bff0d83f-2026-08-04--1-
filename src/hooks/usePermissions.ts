import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPermissions } from "@/lib/rbac.functions";
import type { PermissionKey } from "@/lib/rbac/registry";

export function usePermissions() {
  const fn = useServerFn(getMyPermissions);
  const q = useQuery({
    queryKey: ["rbac", "my-permissions"],
    queryFn: () => fn(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const grantedSet = new Set(
    (q.data ?? []).filter((r) => r.granted).map((r) => r.permission_key),
  );
  return {
    ...q,
    permissions: q.data ?? [],
    has: (key: PermissionKey | string) => grantedSet.has(key as string),
    hasAny: (keys: (PermissionKey | string)[]) => keys.some((k) => grantedSet.has(k as string)),
    hasAll: (keys: (PermissionKey | string)[]) => keys.every((k) => grantedSet.has(k as string)),
  };
}

export function usePermission(key: PermissionKey | string) {
  const { has, isPending } = usePermissions();
  return { allowed: has(key), isPending };
}
