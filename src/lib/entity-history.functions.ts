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
      .select("*, profiles:actor_id(full_name, avatar_url, email)")
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
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: rows ?? [],
      nextCursor: rows && rows.length === data.limit ? rows[rows.length - 1].created_at : null,
    };
  });
