import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function currentCompanyId(context: { supabase: any; userId: string }): Promise<string> {
  const { data } = await context.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

export const listQuickReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [foldersRes, repliesRes] = await Promise.all([
      context.supabase.from("quick_reply_folders").select("id, name, created_at").order("name"),
      context.supabase
        .from("quick_replies")
        .select("id, folder_id, shortcut, title, body, attachments, updated_at")
        .order("shortcut"),
    ]);
    if (foldersRes.error) throw new Error(foldersRes.error.message);
    if (repliesRes.error) throw new Error(repliesRes.error.message);
    return { folders: foldersRes.data ?? [], replies: repliesRes.data ?? [] };
  });

export const upsertQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    shortcut: string;
    title: string;
    body: string;
    folder_id?: string | null;
  }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        shortcut: z.string().min(2).max(60).regex(/^\/[a-zA-Z0-9_-]+$/, "Use /comando"),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(4000),
        folder_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    if (data.id) {
      const { error } = await context.supabase
        .from("quick_replies")
        .update({
          shortcut: data.shortcut,
          title: data.title,
          body: data.body,
          folder_id: data.folder_id ?? null,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("quick_replies")
      .insert({
        company_id: companyId,
        shortcut: data.shortcut,
        title: data.title,
        body: data.body,
        folder_id: data.folder_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("quick_replies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) =>
    z.object({ name: z.string().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await currentCompanyId(context);
    const { data: row, error } = await context.supabase
      .from("quick_reply_folders")
      .insert({ company_id: companyId, name: data.name })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("quick_reply_folders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
