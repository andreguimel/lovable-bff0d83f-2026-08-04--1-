import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/rbac/guard";

export type ProviderId =
  | "resend"
  | "openai"
  | "anthropic"
  | "google_gemini"
  | "meta_whatsapp"
  | "meta_instagram"
  | "meta_messenger"
  | "stripe"
  | "stevo"
  | "custom_webhook";

export const AI_PROVIDER_IDS = ["openai", "anthropic", "google_gemini"] as const satisfies ReadonlyArray<ProviderId>;
export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export const PROVIDERS: Array<{
  id: ProviderId;
  name: string;
  description: string;
  credentialFields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string }>;
  configFields: Array<{ key: string; label: string; placeholder?: string }>;
  hasInboundWebhook?: boolean;
}> = [
  {
    id: "resend",
    name: "Resend (E-mail)",
    description: "Envio de e-mails transacionais e broadcasts.",
    credentialFields: [{ key: "api_key", label: "API Key", secret: true, placeholder: "re_..." }],
    configFields: [{ key: "from_email", label: "Remetente (from)", placeholder: "no-reply@seudominio.com" }],
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    description: "Modelos GPT para agentes personalizados e para o Guardião.",
    credentialFields: [{ key: "api_key", label: "API Key", secret: true, placeholder: "sk-..." }],
    configFields: [{ key: "default_model", label: "Modelo padrão", placeholder: "gpt-4o-mini" }],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Modelos Claude para agentes e para o Guardião.",
    credentialFields: [{ key: "api_key", label: "API Key", secret: true, placeholder: "sk-ant-..." }],
    configFields: [{ key: "default_model", label: "Modelo padrão", placeholder: "claude-3-5-sonnet-latest" }],
  },
  {
    id: "google_gemini",
    name: "Google Gemini",
    description: "Modelos Gemini via Google AI Studio.",
    credentialFields: [{ key: "api_key", label: "API Key", secret: true, placeholder: "AIza..." }],
    configFields: [{ key: "default_model", label: "Modelo padrão", placeholder: "gemini-2.5-flash" }],
  },
  {
    id: "meta_whatsapp",
    name: "Meta WhatsApp Cloud API",
    description: "Canal oficial WhatsApp Business.",
    credentialFields: [
      { key: "access_token", label: "Access Token", secret: true, placeholder: "EAAG..." },
      { key: "app_secret", label: "App Secret (opcional)", secret: true },
    ],
    configFields: [
      { key: "phone_number_id", label: "Phone Number ID" },
      { key: "waba_id", label: "WABA ID" },
    ],
    hasInboundWebhook: true,
  },
  {
    id: "meta_instagram",
    name: "Meta Instagram",
    description: "Mensagens diretas do Instagram.",
    credentialFields: [{ key: "page_access_token", label: "Page Access Token", secret: true }],
    configFields: [{ key: "page_id", label: "Page ID" }],
    hasInboundWebhook: true,
  },
  {
    id: "meta_messenger",
    name: "Meta Messenger",
    description: "Mensagens do Facebook Messenger.",
    credentialFields: [{ key: "page_access_token", label: "Page Access Token", secret: true }],
    configFields: [{ key: "page_id", label: "Page ID" }],
    hasInboundWebhook: true,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Cobranças, planos e webhooks de pagamento.",
    credentialFields: [
      { key: "secret_key", label: "Secret Key", secret: true, placeholder: "sk_live_..." },
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
    ],
    configFields: [],
    hasInboundWebhook: true,
  },
  {
    id: "stevo",
    name: "Stevo API",
    description: "API de Gestão Stevo para WhatsApp.",
    credentialFields: [{ key: "api_key", label: "API Key", secret: true, placeholder: "stevo_sk_..." }],
    configFields: [{ key: "base_url", label: "Base URL (opcional)", placeholder: "https://openapi.stevo.chat" }],
    hasInboundWebhook: false,
  },
  {
    id: "custom_webhook",
    name: "Webhook customizado",
    description: "Receba eventos do sistema em uma URL própria (HMAC).",
    credentialFields: [],
    configFields: [{ key: "target_url", label: "URL de destino", placeholder: "https://..." }],
    hasInboundWebhook: false,
  },
];

function mask(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  if (!s) return "";
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 3)}••••${s.slice(-4)}`;
}

function maskCredentials(provider: string, creds: Record<string, unknown>) {
  const def = PROVIDERS.find((p) => p.id === provider);
  const out: Record<string, string> = {};
  const keys = def ? def.credentialFields.map((f) => f.key) : Object.keys(creds);
  for (const k of keys) {
    if (creds[k]) out[k] = mask(creds[k]);
  }
  return out;
}

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  await requireAdmin(context, "Apenas administradores podem alterar integrações.");
}

async function getCompanyId(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.company_id) throw new Error("Empresa não encontrada.");
  return data.company_id as string;
}

// ------------------ list ------------------
export const listIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getCompanyId(context as any);
    const { data, error } = await (context as any).supabase
      .from("integrations")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id as string,
      provider: row.provider as ProviderId,
      label: row.label as string,
      credentials_masked: maskCredentials(row.provider, row.credentials ?? {}),
      config: (row.config ?? {}) as Record<string, string>,
      webhook_url: row.webhook_url as string | null,
      webhook_secret_masked: row.webhook_secret ? mask(row.webhook_secret) : null,
      enabled: !!row.enabled,
      last_tested_at: row.last_tested_at as string | null,
      test_status: row.test_status as string | null,
      test_error: row.test_error as string | null,
    }));
  });

// ------------------ get for edit ------------------
// SECURITY: nunca retornar valores completos de credenciais marcadas como
// `secret: true` para o cliente. O formulário de edição inicia vazio nesses
// campos e o backend faz merge com o valor existente ao salvar, portanto o
// browser não precisa (e não deve) receber o plaintext do segredo. Apenas
// campos operacionais gerados pelo próprio Zenda (verify_token/webhook_secret)
// são retornados em texto pleno, pois o administrador precisa colá-los na
// configuração do provider externo.
export const getIntegrationForEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const companyId = await getCompanyId(context as any);
    const { data: row, error } = await (context as any).supabase
      .from("integrations")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Integração não encontrada.");

    const providerDef = PROVIDERS.find((p) => p.id === row.provider);
    const secretKeys = new Set(
      (providerDef?.credentialFields ?? []).filter((f) => f.secret).map((f) => f.key),
    );
    const rawCreds = (row.credentials ?? {}) as Record<string, string>;
    const safeCreds: Record<string, string> = {};
    const credentialsConfigured: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(rawCreds)) {
      if (secretKeys.has(k)) {
        // Não devolve o plaintext; apenas sinaliza que existe.
        credentialsConfigured[k] = Boolean(v);
      } else {
        // verify_token e afins são operacionais do próprio Zenda; podem ser exibidos.
        safeCreds[k] = v;
        credentialsConfigured[k] = Boolean(v);
      }
    }

    return {
      id: row.id as string,
      provider: row.provider as ProviderId,
      label: row.label as string,
      credentials: safeCreds,
      credentials_configured: credentialsConfigured,
      config: (row.config ?? {}) as Record<string, string>,
      webhook_url: row.webhook_url as string | null,
      webhook_secret: row.webhook_secret as string | null,
      enabled: !!row.enabled,
    };
  });


// ------------------ upsert ------------------
const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum([
    "resend",
    "openai",
    "anthropic",
    "google_gemini",
    "meta_whatsapp",
    "meta_instagram",
    "meta_messenger",
    "stripe",
    "stevo",
    "custom_webhook",
  ]),
  label: z.string().trim().min(1).max(60).default("Padrão"),
  credentials: z.record(z.string(), z.string()).default({}),
  config: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});

export const upsertIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const companyId = await getCompanyId(context as any);
    const supabase = (context as any).supabase;

    const providerDef = PROVIDERS.find((p) => p.id === data.provider);
    if (!providerDef) throw new Error("Provedor inválido.");

    // Merge credentials with existing so we don't wipe on partial edits.
    let existingCredentials: Record<string, string> = {};
    let existingWebhookSecret: string | null = null;
    if (data.id) {
      const { data: existing } = await supabase
        .from("integrations")
        .select("credentials, webhook_secret")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      existingCredentials = (existing?.credentials ?? {}) as Record<string, string>;
      existingWebhookSecret = existing?.webhook_secret ?? null;
    }

    const nextCredentials: Record<string, string> = { ...existingCredentials };
    for (const [k, v] of Object.entries(data.credentials)) {
      if (v && v.trim() !== "") nextCredentials[k] = v;
    }

    let webhookSecret = existingWebhookSecret;
    let webhookUrl: string | null = null;
    if (providerDef.hasInboundWebhook) {
      if (!webhookSecret) webhookSecret = randomToken(24);
      if (!nextCredentials.verify_token) nextCredentials.verify_token = randomToken(16);
    }

    const payload = {
      company_id: companyId,
      provider: data.provider,
      label: data.label,
      credentials: nextCredentials,
      config: data.config,
      enabled: data.enabled,
      webhook_secret: webhookSecret,
      webhook_url: webhookUrl,
    };

    if (data.id) {
      const { data: row, error } = await supabase
        .from("integrations")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", companyId)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id as string };
    }
    const { data: row, error } = await supabase
      .from("integrations")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

// ------------------ toggle ------------------
export const toggleIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const companyId = await getCompanyId(context as any);
    const { error } = await (context as any).supabase
      .from("integrations")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------ delete ------------------
export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const companyId = await getCompanyId(context as any);
    const { error } = await (context as any).supabase
      .from("integrations")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------ regenerate webhook secret ------------------
export const regenerateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const companyId = await getCompanyId(context as any);
    const supabase = (context as any).supabase;
    const { data: existing, error: readErr } = await supabase
      .from("integrations")
      .select("credentials")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const creds = (existing?.credentials ?? {}) as Record<string, string>;
    creds.verify_token = randomToken(16);
    const { error } = await supabase
      .from("integrations")
      .update({ webhook_secret: randomToken(24), credentials: creds })
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------ test ------------------
export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const companyId = await getCompanyId(context as any);
    const supabase = (context as any).supabase;

    const { data: row, error } = await supabase
      .from("integrations")
      .select("provider, credentials, config")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Integração não encontrada.");

    const creds = (row.credentials ?? {}) as Record<string, string>;
    const config = (row.config ?? {}) as Record<string, string>;

    let status: "ok" | "error" = "ok";
    let errMsg: string | null = null;

    try {
      switch (row.provider as ProviderId) {
        case "resend": {
          if (!creds.api_key) throw new Error("API Key ausente");
          const r = await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${creds.api_key}` },
          });
          if (!r.ok) throw new Error(`Resend respondeu ${r.status}: ${await r.text()}`);
          break;
        }
        case "openai": {
          if (!creds.api_key) throw new Error("API Key ausente");
          const r = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${creds.api_key}` },
          });
          if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}`);
          break;
        }
        case "anthropic": {
          if (!creds.api_key) throw new Error("API Key ausente");
          const r = await fetch("https://api.anthropic.com/v1/models", {
            headers: { "x-api-key": creds.api_key, "anthropic-version": "2023-06-01" },
          });
          if (!r.ok) throw new Error(`Anthropic respondeu ${r.status}`);
          break;
        }
        case "google_gemini": {
          if (!creds.api_key) throw new Error("API Key ausente");
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(creds.api_key)}`,
          );
          if (!r.ok) throw new Error(`Google Gemini respondeu ${r.status}`);
          break;
        }
        case "meta_whatsapp":
        case "meta_instagram":
        case "meta_messenger": {
          const token = creds.access_token || creds.page_access_token;
          if (!token) throw new Error("Token ausente");
          const r = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${encodeURIComponent(token)}`);
          if (!r.ok) throw new Error(`Meta respondeu ${r.status}: ${await r.text()}`);
          break;
        }
        case "stripe": {
          if (!creds.secret_key) throw new Error("Secret Key ausente");
          const r = await fetch("https://api.stripe.com/v1/account", {
            headers: { Authorization: `Bearer ${creds.secret_key}` },
          });
          if (!r.ok) throw new Error(`Stripe respondeu ${r.status}`);
          break;
        }
        case "stevo": {
          if (!creds.api_key) throw new Error("API Key ausente");
          const baseUrl = config.base_url || "https://openapi.stevo.chat";
          const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/instances`, {
            headers: { Authorization: `Bearer ${creds.api_key}` },
          });
          if (!r.ok) {
            if (r.status === 401) throw new Error("API Key inválida ou sem permissão.");
            throw new Error(`Stevo respondeu ${r.status}`);
          }
          break;
        }
        case "custom_webhook": {
          if (!config.target_url) throw new Error("URL de destino ausente");
          const r = await fetch(config.target_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: "test.ping", ts: Date.now() }),
          });
          if (!r.ok) throw new Error(`Destino respondeu ${r.status}`);
          break;
        }
      }
    } catch (e) {
      status = "error";
      errMsg = e instanceof Error ? e.message : String(e);
    }

    await supabase
      .from("integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        test_status: status,
        test_error: errMsg,
      })
      .eq("id", data.id)
      .eq("company_id", companyId);

    return { status, error: errMsg };
  });
