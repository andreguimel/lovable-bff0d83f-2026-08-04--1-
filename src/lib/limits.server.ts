// Server-only helper: enforce plan limits before creating billable resources.
// System is for internal company use — ALL LIMITS DISABLED.
// This function is kept as a no-op to preserve existing call sites.
import type { SupabaseClient } from "@supabase/supabase-js";

type Resource = "channels" | "agents" | "contacts" | "messages";

export async function assertWithinLimit(
  _supabase: SupabaseClient,
  _companyId: string,
  _resource: Resource,
): Promise<void> {
  // Uso interno da empresa — sem limites.
  return;
}
