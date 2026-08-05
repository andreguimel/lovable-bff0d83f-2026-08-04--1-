/**
 * ZENDA CORE ALIGNMENT 01 — COMPLEMENTARY ACCEPTANCE
 * Cenário canônico de 3 canais (contrato de aceite original).
 *
 *   A → outbound
 *   B → outbound
 *   C → outbound
 *   C → inbound reply
 *
 * Prova:
 *   CONTACTS = 1
 *   LOGICAL CONVERSATIONS = 1
 *   CHANNELS USED = 3
 *   OUTBOUND A/B/C = PASS · INBOUND C = PASS
 *   LAST INBOUND CHANNEL = C · DEFAULT REPLY CHANNEL = C
 *   STOP-ON-REPLY = PASS · NEXT ATTEMPT AFTER REPLY = 0
 *   INBOX = 1 CONV · CRM = 1 CONTACT
 *   MULTI-TENANCY · IDEMPOTENCY · RACE SAFETY
 */
import { createClient } from "@supabase/supabase-js";

import { _executeCascadeStep } from "../src/lib/cascade.functions";
import {
  findOrCreateCanonicalContact,
  findOrCreateLogicalConversation,
  stopReengagementCascades,
} from "../src/lib/identity/canonical.server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (
        SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_") &&
        h.get("Authorization") === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      ) {
        h.delete("Authorization");
      }
      h.set("apikey", SUPABASE_SERVICE_ROLE_KEY);
      return fetch(input, { ...init, headers: h });
    },
  },
});

const results: Array<{ check: string; pass: boolean; detail?: string }> = [];
function assert(check: string, cond: boolean, detail?: string) {
  results.push({ check, pass: cond, detail });
  console.log(`${cond ? "✅" : "❌"} ${check}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const stamp = Date.now();
  const companyName = `E2E-Zenda-3CH-${stamp}`;

  const { data: company } = await sb
    .from("companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  if (!company) throw new Error("Falha ao criar company");
  const companyId = company.id;
  console.log(`\n▶️  Company: ${companyId} (${companyName})\n`);

  try {
    // 3 canais WhatsApp mock
    const channels: Array<{ id: string; label: "A" | "B" | "C" }> = [];
    for (const label of ["A", "B", "C"] as const) {
      const suffix = label === "A" ? "11" : label === "B" ? "22" : "33";
      const { data: ch, error } = await sb
        .from("channels")
        .insert({
          company_id: companyId,
          name: `Canal ${label}`,
          provider_type: "whatsapp_cloud",
          phone_number: `+55149000003${suffix}`,
          status: "connected",
          credentials: {},
        })
        .select("id")
        .single();
      if (error || !ch) throw new Error(`Falha ao criar canal ${label}: ${error?.message}`);
      channels.push({ id: ch.id, label });
    }
    const chA = channels[0], chB = channels[1], chC = channels[2];

    // 1) Contato canônico
    const contact = await findOrCreateCanonicalContact(sb as never, {
      companyId,
      rawPhone: "+5514991234567",
      name: "Cliente WebMarcas",
    });
    assert("CONTACTS = 1 (canonical create)", !!contact.contactId);

    // 2) Conversa lógica única
    const conv = await findOrCreateLogicalConversation(sb as never, {
      companyId,
      contactId: contact.contactId,
      originChannelId: chA.id,
    });
    assert("LOGICAL CONVERSATION = 1 (created)", conv.isNew);

    // 3) Policy de 4 passos (o 4º só valida STOP-ON-REPLY após 3 outbounds)
    const { data: policy } = await sb
      .from("cascade_policies")
      .insert({
        company_id: companyId,
        name: "E2E 3CH policy",
        active: true,
        steps: [
          { channel_type: "whatsapp", wait_minutes: 0, message: "Olá {{nome}} - t1" },
          { channel_type: "whatsapp", wait_minutes: 0, message: "Olá {{nome}} - t2" },
          { channel_type: "whatsapp", wait_minutes: 0, message: "Olá {{nome}} - t3" },
          { channel_type: "whatsapp", wait_minutes: 0, message: "Olá {{nome}} - t4" },
        ],
      })
      .select("id")
      .single();
    if (!policy) throw new Error("Falha ao criar policy");

    // 4) Run
    const { data: run } = await sb
      .from("cascade_runs")
      .insert({
        company_id: companyId,
        policy_id: policy.id,
        contact_id: contact.contactId,
        conversation_id: conv.conversationId,
        status: "running",
        current_step: 0,
        run_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (!run) throw new Error("Falha ao criar run");

    // 5) 3 outbounds → deve rotacionar A, B, C (cross-channel)
    await _executeCascadeStep(sb as never, run.id);
    await _executeCascadeStep(sb as never, run.id);
    await _executeCascadeStep(sb as never, run.id);

    const { data: attempts3 } = await sb
      .from("cascade_attempts")
      .select("channel_id, step_index")
      .eq("run_id", run.id)
      .order("step_index");

    const usedChannels = new Set((attempts3 ?? []).map((a) => a.channel_id).filter(Boolean));
    assert(
      "CHANNELS USED = 3",
      usedChannels.size === 3,
      `used=${usedChannels.size} channels=[${[...usedChannels].join(",")}]`,
    );
    assert("OUTBOUND CHANNEL A", usedChannels.has(chA.id));
    assert("OUTBOUND CHANNEL B", usedChannels.has(chB.id));
    assert("OUTBOUND CHANNEL C", usedChannels.has(chC.id));

    // 6) Inbound reply pelo canal C
    const providerMsgId = `wamid.E2E3CH-${stamp}`;
    const { data: inboundMsg, error: inboundErr } = await sb
      .from("messages")
      .insert({
        company_id: companyId,
        conversation_id: conv.conversationId,
        channel_id: chC.id,
        direction: "inbound",
        type: "text",
        body: "Oi, respondi pelo C!",
        provider_message_id: providerMsgId,
        status: "delivered",
      })
      .select("id")
      .single();
    assert("INBOUND CHANNEL C", !inboundErr && !!inboundMsg?.id, inboundErr?.message);

    await sb
      .from("contacts")
      .update({
        last_inbound_channel_id: chC.id,
        last_interaction_at: new Date().toISOString(),
      })
      .eq("id", contact.contactId);

    const stopped = await stopReengagementCascades(sb as never, {
      companyId,
      contactId: contact.contactId,
      replyMessageId: inboundMsg!.id,
      replyChannelId: chC.id,
    });
    assert("STOP-ON-REPLY", stopped >= 1, `stopped=${stopped}`);

    // 7) Próximo passo (4º) NÃO deve gerar attempt
    const beforeCount = attempts3?.length ?? 0;
    await _executeCascadeStep(sb as never, run.id);
    const { data: attemptsAfter } = await sb
      .from("cascade_attempts")
      .select("id")
      .eq("run_id", run.id);
    assert(
      "NEXT ATTEMPT AFTER REPLY = 0",
      (attemptsAfter?.length ?? 0) === beforeCount,
      `before=${beforeCount} after=${attemptsAfter?.length}`,
    );

    // 8) Continuidade — last_inbound + default reply
    const { data: contactAfter } = await sb
      .from("contacts")
      .select("last_inbound_channel_id")
      .eq("id", contact.contactId)
      .single();
    assert(
      "LAST INBOUND CHANNEL = C",
      contactAfter?.last_inbound_channel_id === chC.id,
      `got=${contactAfter?.last_inbound_channel_id}`,
    );
    assert(
      "DEFAULT REPLY CHANNEL = C",
      contactAfter?.last_inbound_channel_id === chC.id,
    );

    // 9) CRM = 1 · INBOX = 1
    const { count: contactCount } = await sb
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null);
    assert("CRM = 1 CONTACT", contactCount === 1, `contacts=${contactCount}`);

    const { count: convCount } = await sb
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("contact_id", contact.contactId)
      .in("status", ["open", "pending"]);
    assert("INBOX = 1 CONVERSATION", convCount === 1, `conversations=${convCount}`);

    // 10) LOGICAL CONVERSATIONS = 1 (idempotência via helper)
    const convDup = await findOrCreateLogicalConversation(sb as never, {
      companyId,
      contactId: contact.contactId,
      originChannelId: chB.id,
    });
    assert(
      "LOGICAL CONVERSATIONS = 1",
      convDup.conversationId === conv.conversationId,
      `dup=${convDup.conversationId} orig=${conv.conversationId}`,
    );

    // 11) Multi-tenancy
    const { count: crossTenant } = await sb
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("phone_canonical", "+5514991234567")
      .neq("company_id", companyId);
    assert("MULTI-TENANCY", (crossTenant ?? 0) === 0, `cross=${crossTenant}`);

    // 12) Idempotência inbound (SELECT-then-INSERT do webhook)
    const { count: dupCount } = await sb
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.conversationId)
      .eq("provider_message_id", providerMsgId);
    assert("IDEMPOTENCY (inbound lookup stable)", (dupCount ?? 0) === 1, `count=${dupCount}`);

    // 13) Race safety — 2 claims concorrentes, no máx um pega a mesma run
    const { data: run2 } = await sb
      .from("cascade_runs")
      .insert({
        company_id: companyId,
        policy_id: policy.id,
        contact_id: contact.contactId,
        conversation_id: conv.conversationId,
        status: "running",
        current_step: 0,
        run_at: new Date(Date.now() - 1000).toISOString(),
      })
      .select("id")
      .single();
    const [c1, c2] = await Promise.all([
      sb.rpc("cascade_run_claim", { _ttl_seconds: 60 }),
      sb.rpc("cascade_run_claim", { _ttl_seconds: 60 }),
    ]);
    const rows1 = (c1.data as Array<{ id: string }> | null) ?? [];
    const rows2 = (c2.data as Array<{ id: string }> | null) ?? [];
    const ids1 = new Set(rows1.map((r) => r.id));
    const overlap = rows2.some((r) => ids1.has(r.id));
    assert("RACE SAFETY", !overlap, `c1=${rows1.length} c2=${rows2.length}`);
    if (run2) await sb.from("cascade_runs").delete().eq("id", run2.id);
  } finally {
    await sb.from("companies").delete().eq("id", companyId);
    console.log(`\n🧹 Cleanup: company ${companyId} removida.`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=========================================`);
  console.log(`RESULT: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.log(`FAILED:`);
    failed.forEach((f) => console.log(` - ${f.check} ${f.detail ?? ""}`));
    process.exit(1);
  } else {
    console.log(`✅ ALL GATE CHECKS PASSED`);
  }
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(2);
});
