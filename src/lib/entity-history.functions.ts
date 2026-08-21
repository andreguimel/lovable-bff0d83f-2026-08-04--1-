import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function currentCompanyId(context: { supabase: any; userId: string }): Promise<string> {
  const { data } = await context.supabase
    .from("profiles").select("company_id").eq("id", context.userId).maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

const historySchema = z.object({
  entity: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const listEntityHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof historySchema>) => historySchema.parse(i))
  .handler(async ({ context, data }) => {
    const companyId = await currentCompanyId(context);
    let q = context.supabase
      .from("team_entity_history")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.actorId) q = q.eq("actor_id", data.actorId);
    if (data.action) q = q.eq("action", data.action);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.cursor) q = q.lt("created_at", data.cursor);
    const { data: rawRows, error } = await q;
    if (error) throw new Error(error.message);

    const rows = rawRows ?? [];
    const actorIds = Array.from(
      new Set(
        rows
          .map((r: { actor_id?: string | null }) => r.actor_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null }>();
    if (actorIds.length > 0) {
      const { data: profileRows } = await context.supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email")
        .in("id", actorIds);

      (profileRows ?? []).forEach((p: { id: string; full_name: string | null; avatar_url: string | null; email: string | null }) => {
        profilesMap.set(p.id, {
          full_name: p.full_name ?? null,
          avatar_url: p.avatar_url ?? null,
          email: p.email ?? null,
        });
      });
    }

    const rowsWithProfiles = rows.map((r: { actor_id?: string | null }) => ({
      ...r,
      profiles: r.actor_id ? profilesMap.get(r.actor_id) ?? null : null,
    }));

    return {
      rows: rowsWithProfiles,
      nextCursor: rows.length === data.limit ? rows[rows.length - 1].created_at : null,
    };
  });
