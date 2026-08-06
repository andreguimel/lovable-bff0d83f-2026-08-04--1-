import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toE164 } from "./identity/phone";


// ---------------- List contacts ----------------
const listInput = z.object({
  search: z.string().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  sort: z.enum(["recent", "name", "created"]).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof listInput> | undefined) => listInput.optional().parse(i))
  .handler(async ({ data, context }) => {
    const page = data?.page ?? 1;
    const pageSize = data?.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = context.supabase
      .from("contacts")
      .select(
        "id, name, phone, email, avatar_url, last_interaction_at, created_at, funnel_stage, deal_value_cents, lead_score, company_name, job_title, origin, owner_id, next_action, contact_tags(tag:tags(id, name, color))",
        { count: "exact" },
      )
      .is("deleted_at", null);

    if (data?.search && data.search.trim()) {
      const s = data.search.trim();
      const esc = s.replace(/[%,]/g, " ");
      const canon = toE164(s);
      const digits = s.replace(/\D+/g, "");
      const parts = [
        `name.ilike.%${esc}%`,
        `phone.ilike.%${esc}%`,
        `email.ilike.%${esc}%`,
        `company_name.ilike.%${esc}%`,
      ];
      if (canon) parts.push(`phone_canonical.eq.${canon}`);
      if (digits.length >= 4) parts.push(`phone_canonical.ilike.%${digits}%`);
      q = q.or(parts.join(","));
    }


    const sort = data?.sort ?? "recent";
    if (sort === "name") q = q.order("name", { ascending: true });
    else if (sort === "created") q = q.order("created_at", { ascending: false });
    else q = q.order("last_interaction_at", { ascending: false, nullsFirst: false });

    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    let filtered = (rows ?? []) as Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      avatar_url: string | null;
      last_interaction_at: string | null;
      created_at: string;
      funnel_stage: string | null;
      deal_value_cents: number | null;
      lead_score: number | null;
      company_name: string | null;
      job_title: string | null;
      origin: string | null;
      owner_id: string | null;
      next_action: string | null;
      contact_tags: Array<{ tag: { id: string; name: string; color: string } | null } | null> | null;
    }>;

    if (data?.tagIds?.length) {
      const set = new Set(data.tagIds);
      filtered = filtered.filter((r) =>
        (r.contact_tags ?? []).some((ct) => ct?.tag && set.has(ct.tag.id)),
      );
    }

    return {
      rows: filtered.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        avatar_url: r.avatar_url,
        last_interaction_at: r.last_interaction_at,
        created_at: r.created_at,
        stage: r.funnel_stage,
        value_cents: r.deal_value_cents,
        lead_score: r.lead_score ?? 0,
        company_name: r.company_name,
        job_title: r.job_title,
        origin: r.origin,
        owner_id: r.owner_id,
        next_action: r.next_action,
        tags: (r.contact_tags ?? [])
          .map((ct) => ct?.tag)
          .filter((t): t is { id: string; name: string; color: string } => !!t),
      })),
      total: count ?? filtered.length,
      page,
      pageSize,
    };
  });


// ---------------- Get contact ----------------
export const getContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: contact, error } = await context.supabase
      .from("contacts")
      .select("id, name, phone, email, avatar_url, notes, last_interaction_at, created_at, company_id, deleted_at, funnel_stage, deal_value_cents, lead_score, company_name, job_title, origin, owner_id, next_action, ai_insights")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!contact || contact.deleted_at) throw new Error("Contato não encontrado");

    const [{ data: ct }, { data: cfv }, { data: conv }] = await Promise.all([
      context.supabase.from("contact_tags").select("tag:tags(id, name, color)").eq("contact_id", data.id),
      context.supabase
        .from("contact_field_values")
        .select("field_id, value")
        .eq("contact_id", data.id),
      context.supabase
        .from("conversations")
        .select("id, status, last_message_at, last_message_preview, channel:channels!channel_id(id, name)")
        .eq("contact_id", data.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(20),
    ]);

    return {
      contact,
      tags: (ct ?? [])
        .map((r) => r.tag as { id: string; name: string; color: string } | null)
        .filter((t): t is { id: string; name: string; color: string } => !!t),
      customValues: (cfv ?? []) as Array<{ field_id: string; value: string | null }>,
      conversations: (conv ?? []) as Array<{
        id: string;
        status: string;
        last_message_at: string | null;
        last_message_preview: string | null;
        channel: { id: string; name: string } | null;
      }>,
    };
  });

// ---------------- Create contact ----------------
const contactInput = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  phone: z.string().trim().min(3, "Telefone obrigatório").max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  notes: z.string().max(4000).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  customFields: z.record(z.string(), z.string().nullable()).optional(),
});

export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof contactInput>) => contactInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .single();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    const canonical = toE164(data.phone);

    // Canonical dedupe (identidade forte por telefone E.164)
    if (canonical) {
      const { data: existingByCanon } = await context.supabase
        .from("contacts")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("phone_canonical", canonical)
        .is("deleted_at", null)
        .is("merged_into_id", null)
        .maybeSingle();
      if (existingByCanon) {
        return { id: existingByCanon.id, existed: true as const };
      }
    }

    const { data: inserted, error } = await context.supabase
      .from("contacts")
      .insert({
        company_id: profile.company_id,
        name: data.name,
        phone: data.phone,
        phone_canonical: canonical,
        email: data.email || null,
        notes: data.notes || null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um contato com este telefone");
      throw new Error(error.message);
    }

    if (data.tagIds?.length) {
      await context.supabase.from("contact_tags").insert(
        data.tagIds.map((tag_id) => ({
          contact_id: inserted.id,
          tag_id,
          company_id: profile.company_id,
        })),
      );
    }

    if (data.customFields) {
      const rows = Object.entries(data.customFields)
        .filter(([, v]) => v !== null && v !== "")
        .map(([field_id, value]) => ({
          contact_id: inserted.id,
          field_id,
          company_id: profile.company_id,
          value,
        }));
      if (rows.length) await context.supabase.from("contact_field_values").upsert(rows);
    }

    return { id: inserted.id, existed: false as const };

  });

// ---------------- Update contact ----------------
const updateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  notes: z.string().max(4000).nullable().optional(),
  company_name: z.string().max(200).nullable().optional(),
  job_title: z.string().max(120).nullable().optional(),
  origin: z.string().max(60).nullable().optional(),
  funnel_stage: z.string().max(40).nullable().optional(),
  deal_value_cents: z.number().int().nullable().optional(),
  lead_score: z.number().int().min(0).max(100).nullable().optional(),
  next_action: z.string().max(200).nullable().optional(),
});
export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof updateInput>) => updateInput.parse(i))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.phone !== undefined) {
      patch.phone = data.phone || null;
      const canonical = data.phone ? toE164(data.phone) : null;
      patch.phone_canonical = canonical;
      if (canonical) {
        // Buscar contato atual para escopo de tenant
        const { data: current } = await context.supabase
          .from("contacts")
          .select("company_id")
          .eq("id", data.id)
          .maybeSingle();
        if (!current) throw new Error("Contato não encontrado");
        const { data: collision } = await context.supabase
          .from("contacts")
          .select("id")
          .eq("company_id", current.company_id)
          .eq("phone_canonical", canonical)
          .is("deleted_at", null)
          .is("merged_into_id", null)
          .neq("id", data.id)
          .maybeSingle();
        if (collision) throw new Error("Já existe um contato com este telefone");
      }
    }
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.company_name !== undefined) patch.company_name = data.company_name || null;
    if (data.job_title !== undefined) patch.job_title = data.job_title || null;
    if (data.origin !== undefined) patch.origin = data.origin || null;
    if (data.funnel_stage !== undefined) patch.funnel_stage = data.funnel_stage || null;
    if (data.deal_value_cents !== undefined) patch.deal_value_cents = data.deal_value_cents;
    if (data.lead_score !== undefined) patch.lead_score = data.lead_score;
    if (data.next_action !== undefined) patch.next_action = data.next_action || null;
    const { error } = await context.supabase.from("contacts").update(patch as never).eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um contato com este telefone");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------- Assign owner ----------------
export const assignContactOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string; ownerId: string | null }) =>
    z
      .object({ contactId: z.string().uuid(), ownerId: z.string().uuid().nullable() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("contacts")
      .select("company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!current) throw new Error("Contato não encontrado");

    if (data.ownerId) {
      // O membro precisa pertencer à mesma company (via profiles)
      const { data: member } = await context.supabase
        .from("profiles")
        .select("id")
        .eq("id", data.ownerId)
        .eq("company_id", current.company_id)
        .maybeSingle();
      if (!member) throw new Error("Membro inválido para esta empresa");
    }

    const { error } = await context.supabase
      .from("contacts")
      .update({ owner_id: data.ownerId } as never)
      .eq("id", data.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



// ---------------- Delete (soft) ----------------
export const deleteContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { ids: string[] }) =>
    z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contacts")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

// ---------------- Bulk tag ----------------
export const bulkTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { ids: string[]; tagId: string; add: boolean }) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1), tagId: z.string().uuid(), add: z.boolean() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .single();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    if (data.add) {
      const rows = data.ids.map((id) => ({
        contact_id: id,
        tag_id: data.tagId,
        company_id: profile.company_id,
      }));
      const { error } = await context.supabase.from("contact_tags").upsert(rows);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("contact_tags")
        .delete()
        .in("contact_id", data.ids)
        .eq("tag_id", data.tagId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------- Toggle single tag ----------------
export const toggleContactTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string; tagId: string; add: boolean }) =>
    z
      .object({ contactId: z.string().uuid(), tagId: z.string().uuid(), add: z.boolean() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase
      .from("contacts")
      .select("company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!c) throw new Error("Contato não encontrado");
    if (data.add) {
      const { error } = await context.supabase
        .from("contact_tags")
        .upsert({ contact_id: data.contactId, tag_id: data.tagId, company_id: c.company_id });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("contact_tags")
        .delete()
        .eq("contact_id", data.contactId)
        .eq("tag_id", data.tagId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------- Import CSV ----------------
const importRow = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(3),
  email: z.string().trim().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
});
export const importContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { rows: Array<z.input<typeof importRow>> }) =>
    z.object({ rows: z.array(importRow).max(2000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .single();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");
    const companyId = profile.company_id;

    // Preload existing tags
    const { data: existingTags } = await context.supabase
      .from("tags")
      .select("id, name")
      .eq("company_id", companyId);
    const tagMap = new Map<string, string>();
    (existingTags ?? []).forEach((t) => tagMap.set(t.name.toLowerCase(), t.id));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      try {
        const canonical = toE164(row.phone);

        // 1) Dedupe canônico (identidade forte E.164)
        let existing: { id: string } | null = null;
        if (canonical) {
          const { data } = await context.supabase
            .from("contacts")
            .select("id")
            .eq("company_id", companyId)
            .eq("phone_canonical", canonical)
            .is("deleted_at", null)
            .is("merged_into_id", null)
            .maybeSingle();
          existing = data ?? null;
        }
        // 2) Fallback: match legado por phone bruto
        if (!existing) {
          const { data } = await context.supabase
            .from("contacts")
            .select("id")
            .eq("company_id", companyId)
            .eq("phone", row.phone)
            .is("deleted_at", null)
            .maybeSingle();
          existing = data ?? null;
        }

        let contactId: string;
        if (existing) {
          await context.supabase
            .from("contacts")
            .update({
              name: row.name,
              email: row.email || null,
              notes: row.notes || null,
              ...(canonical ? { phone_canonical: canonical } : {}),
            })
            .eq("id", existing.id);
          contactId = existing.id;
          updated++;
        } else {
          const { data: ins, error } = await context.supabase
            .from("contacts")
            .insert({
              company_id: companyId,
              name: row.name,
              phone: row.phone,
              phone_canonical: canonical,
              email: row.email || null,
              notes: row.notes || null,
            })
            .select("id")
            .single();
          if (error) throw error;
          contactId = ins.id;
          created++;
        }


        // Tags: comma-separated
        if (row.tags?.trim()) {
          const tagNames = row.tags.split(",").map((t) => t.trim()).filter(Boolean);
          const tagIds: string[] = [];
          for (const name of tagNames) {
            const key = name.toLowerCase();
            let id = tagMap.get(key);
            if (!id) {
              const { data: newTag } = await context.supabase
                .from("tags")
                .insert({ company_id: companyId, name, color: "#3B82F6" })
                .select("id")
                .single();
              if (newTag) {
                id = newTag.id;
                tagMap.set(key, id);
              }
            }
            if (id) tagIds.push(id);
          }
          if (tagIds.length) {
            await context.supabase.from("contact_tags").upsert(
              tagIds.map((tag_id) => ({
                contact_id: contactId,
                tag_id,
                company_id: companyId,
              })),
            );
          }
        }
      } catch (e) {
        skipped++;
        errors.push({ row: i + 1, message: e instanceof Error ? e.message : String(e) });
      }
    }

    return { created, updated, skipped, errors };
  });

// ---------------- Custom fields ----------------
export const listCustomFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("custom_fields")
      .select("id, key, label, field_type, options")
      .order("label");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const cfInput = z.object({
  label: z.string().trim().min(1).max(60),
  field_type: z.enum(["text", "number", "date", "select"]),
  options: z.array(z.string().trim().min(1)).optional(),
});
export const createCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof cfInput>) => cfInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .single();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");
    const key = data.label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const { error } = await context.supabase.from("custom_fields").insert({
      company_id: profile.company_id,
      key,
      label: data.label,
      field_type: data.field_type,
      options: data.options ?? null,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um campo com esse nome");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("custom_fields").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCustomFieldValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string; fieldId: string; value: string | null }) =>
    z
      .object({
        contactId: z.string().uuid(),
        fieldId: z.string().uuid(),
        value: z.string().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase
      .from("contacts")
      .select("company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!c) throw new Error("Contato não encontrado");
    if (data.value === null || data.value === "") {
      await context.supabase
        .from("contact_field_values")
        .delete()
        .eq("contact_id", data.contactId)
        .eq("field_id", data.fieldId);
    } else {
      const { error } = await context.supabase.from("contact_field_values").upsert(
        {
          contact_id: data.contactId,
          field_id: data.fieldId,
          company_id: c.company_id,
          value: data.value,
        },
        { onConflict: "contact_id,field_id" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------- Channels list (for start conversation) ----------------
export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("channels")
      .select("id, name, phone_number, status")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------------- Start conversation from contact ----------------
export const startConversationFromContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string; channelId: string; firstMessage?: string }) =>
    z
      .object({
        contactId: z.string().uuid(),
        channelId: z.string().uuid(),
        firstMessage: z.string().max(4000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase
      .from("contacts")
      .select("company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!c) throw new Error("Contato não encontrado");

    // Reuse open conversation on same channel if exists
    const { data: existing } = await context.supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", data.contactId)
      .eq("channel_id", data.channelId)
      .neq("status", "resolved")
      .maybeSingle();

    let conversationId = existing?.id;
    if (!conversationId) {
      const { data: created, error } = await context.supabase
        .from("conversations")
        .insert({
          company_id: c.company_id,
          contact_id: data.contactId,
          channel_id: data.channelId,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = created.id;
    }

    if (data.firstMessage?.trim()) {
      const firstMessageText = data.firstMessage.trim();

      const { data: chRow } = await context.supabase
        .from("channels")
        .select("id, provider_type, credentials, phone_number, company_id")
        .eq("id", data.channelId)
        .maybeSingle();

      const { data: contactRow } = await context.supabase
        .from("contacts")
        .select("phone, phone_canonical")
        .eq("id", data.contactId)
        .maybeSingle();

      const toPhoneRaw = contactRow?.phone_canonical ?? contactRow?.phone ?? "";
      const toPhone = toPhoneRaw.replace(/^\+/, "").replace(/\D/g, "");

      let providerMessageId: string | null = null;
      let sendError: string | null = null;

      if (chRow && toPhone) {
        const { dispatchSend } = await import("@/lib/wa-providers/index.server");
        const res = await dispatchSend(
          {
            id: chRow.id,
            provider_type: chRow.provider_type,
            credentials: (chRow.credentials ?? {}) as Record<string, unknown>,
            phone_number: chRow.phone_number,
            company_id: c.company_id,
          },
          { type: "text", to: toPhone, body: firstMessageText },
        );
        if (res.ok) providerMessageId = res.provider_message_id;
        else sendError = res.error;
      }

      const meta = sendError ? { send_error: sendError } : null;

      await context.supabase.from("messages").insert({
        company_id: c.company_id,
        conversation_id: conversationId,
        channel_id: data.channelId,
        direction: "outbound",
        type: "text",
        body: firstMessageText,
        sender_user_id: context.userId,
        provider_message_id: providerMessageId ?? null,
        status: sendError ? "failed" : "sent",
        media_metadata: meta as never,
      });

      await context.supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: firstMessageText.slice(0, 120),
        })
        .eq("id", conversationId);
    }

    return { conversationId };
  });
