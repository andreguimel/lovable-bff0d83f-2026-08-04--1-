/**
 * Stevo (API de Gestão Stevo) — adapter de envio.
 *
 * Base URL: https://openapi.stevo.chat
 * Auth:     header `Authorization: Bearer stevo_sk_...` (API Key da CONTA)
 *
 * A credencial é única do workspace e vive no secret `STEVO_API_KEY`.
 * O canal guarda apenas `{ instance_id }` em `channels.credentials`
 * (nenhum segredo é persistido no banco nem devolvido ao client).
 *
 * Endpoints usados:
 *   GET  /v1/instances                      → listar instâncias da conta
 *   GET  /v1/instances/{id}                 → detalhe (teste de conexão)
 *   POST /v1/instances/{id}/messages        → enviar mensagem (proxy)
 */
import type { SendPayload, SendResult } from "./whatsapp-cloud.server";

export const STEVO_BASE_URL = "https://openapi.stevo.chat";

// A engine SM v2 aceita nomes explícitos. Embora versões antigas tratassem
// "All" como curinga, a versão atual o descarta e responde eventString vazio.
const STEVO_WEBHOOK_EVENTS = ["MESSAGE", "READ_RECEIPT"] as const;

export type StevoCreds = {
  instance_id?: string;
  /** Override opcional por canal; por padrão usa o secret do workspace. */
  api_key?: string;
  base_url?: string;
  company_id?: string;
};

export type StevoInstance = {
  id: string;
  name?: string | null;
  status?: string | null;
  phone?: string | null;
  engine?: string | null;
  connected?: boolean;
};

export type CreateStevoInstanceResult =
  | { ok: true; instance: StevoInstance }
  | { ok: false; code: string; message: string };

export async function resolveStevoApiKey(creds?: StevoCreds | null): Promise<string> {
  const fromChannel = typeof creds?.api_key === "string" ? creds.api_key.trim() : "";
  if (fromChannel) return fromChannel;

  if (creds?.company_id) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("integrations").select("credentials").eq("company_id", creds.company_id).eq("provider", "stevo").maybeSingle();
    const apiKey = (data?.credentials as any)?.api_key;
    if (apiKey) return apiKey;
  }

  return (process.env["STEVO_API_KEY"] ?? process.env["VITE_STEVO_API_KEY"] ?? "").trim();
}

function baseUrl(creds?: StevoCreds | null): string {
  const b = typeof creds?.base_url === "string" && creds.base_url ? creds.base_url : STEVO_BASE_URL;
  return b.replace(/\/+$/, "");
}

async function stevoFetch(
  path: string,
  apiKey: string,
  init: RequestInit & { creds?: StevoCreds | null } = {},
): Promise<{ status: number; ok: boolean; json: unknown }> {
  const { creds, ...rest } = init;
  const r = await fetch(`${baseUrl(creds)}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(rest.headers ?? {}),
    },
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, json };
}

/** Falhas transitórias: rate limit e erros de servidor. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const RETRY_DELAYS_MS = [300, 900, 2400];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET com retry + backoff exponencial (300ms → 900ms → 2.4s) para leituras de
 * status da Stevo. Só reexecuta em falha de rede ou status transitório —
 * 401/404 retornam de imediato.
 */
async function stevoGetWithRetry(
  path: string,
  apiKey: string,
  creds?: StevoCreds | null,
): Promise<{ status: number; ok: boolean; json: unknown } | { networkError: true }> {
  let last: { status: number; ok: boolean; json: unknown } | { networkError: true } = {
    networkError: true,
  };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const r = await stevoFetch(path, apiKey, { method: "GET", creds });
      if (r.ok || !isTransientStatus(r.status)) return r;
      last = r;
    } catch {
      last = { networkError: true };
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) await sleep(delay);
  }
  return last;
}


/** Lista as instâncias da conta Stevo (nunca expõe token de servidor). */
export async function listStevoInstances(creds?: StevoCreds | null): Promise<
  { ok: true; instances: StevoInstance[] } | { ok: false; code: string; message: string }
> {
  const apiKey = await resolveStevoApiKey(creds);
  if (!apiKey) {
    return { ok: false, code: "MISSING_API_KEY", message: "Configure o secret STEVO_API_KEY." };
  }
  const r = await stevoGetWithRetry("/v1/instances", apiKey, creds);
  if ("networkError" in r) {
    return { ok: false, code: "NETWORK_ERROR", message: "Falha de rede ao contatar a Stevo." };
  }
  {
    if (!r.ok) {
      return {
        ok: false,
        code: r.status === 401 ? "UNAUTHORIZED" : "STEVO_ERROR",
        message:
          r.status === 401
            ? "API Key da Stevo inválida ou sem permissão."
            : `Stevo respondeu ${r.status}.`,
      };
    }
    const data = (r.json as { data?: unknown }).data;
    const arr = Array.isArray(data) ? data : [];
    const instances: StevoInstance[] = arr.map((raw) => {
      const i = raw as Record<string, unknown>;
      return {
        id: String(i.id ?? ""),
        name: typeof i.name === "string" ? i.name : null,
        status: typeof i.status === "string" ? i.status : null,
        phone: typeof i.phone_number === "string" ? i.phone_number : null,
        engine: typeof i.engine === "string" ? i.engine : null,
        connected: i.connected === true,
      };
    });
    return { ok: true, instances: instances.filter((i) => i.id) };
  }
}

/** POST na API de gestão com retry em falhas transitórias (429/5xx, inclui 502). */
async function stevoPostWithRetry(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<{ status: number; ok: boolean; json: unknown } | { networkError: true }> {
  let last: { status: number; ok: boolean; json: unknown } | { networkError: true } = {
    networkError: true,
  };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const r = await stevoFetch(path, apiKey, { method: "POST", body: JSON.stringify(body) });
      if (r.ok || !isTransientStatus(r.status)) return r;
      last = r;
    } catch {
      last = { networkError: true };
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) await sleep(delay);
  }
  return last;
}

/** Inicia o servidor SM v2 da instância, com retry em 429/5xx (502 incluso). */
async function activateStevoServer(
  serverUrl: string,
  token: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const r = await fetch(`${serverUrl}/instance/connect`, {
        method: "POST",
        headers: { apikey: token, "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: true, subscribe: STEVO_WEBHOOK_EVENTS }),
      });
      if (r.ok) return { ok: true };
      lastStatus = r.status;
      if (!isTransientStatus(r.status)) break;
    } catch {
      lastStatus = null;
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) await sleep(delay);
  }
  return {
    ok: false,
    code: "ACTIVATION_FAILED",
    message:
      lastStatus === null
        ? "Não foi possível iniciar o servidor da instância Stevo."
        : `O servidor da instância Stevo respondeu ${lastStatus} ao iniciar.`,
  };
}

function toInstance(raw: Record<string, unknown>, fallbackId?: string): StevoInstance {
  return {
    id: str(raw.id) ?? fallbackId ?? "",
    name: str(raw.name),
    status: str(raw.status),
    phone: str(raw.phone_number),
    engine: str(raw.engine),
    connected: raw.connected === true,
  };
}

/**
 * Cria/provisiona um servidor SM v2 na conta Stevo.
 *
 * `POST /v1/instances` com `engine: "smv2"` ocupa um slot livre da conta e já
 * devolve `server_url` + `token`. Sem `engine` a API responde 400/5xx.
 */
async function provisionStevoServer(
  apiKey: string,
  name: string,
): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; code: string; message: string }> {
  const safeName = name.replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 60) || `Zenda_${Date.now()}`;
  const created = await stevoPostWithRetry("/v1/instances", apiKey, {
    name: safeName,
    engine: "smv2",
  });
  if ("networkError" in created) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "A Stevo não confirmou a criação da instância. Tente novamente.",
    };
  }
  if (!created.ok) {
    const body = created.json as { error?: { code?: string; message?: string }; message?: string };
    return {
      ok: false,
      code: body.error?.code ?? "STEVO_ERROR",
      message:
        body.error?.message ??
        body.message ??
        (created.status >= 500
          ? `A Stevo respondeu ${created.status} e não há slots de instância livres na conta. Libere uma instância no painel da Stevo e tente novamente.`
          : `Stevo respondeu ${created.status}.`),
    };
  }
  const root = created.json as Record<string, unknown>;
  const raw = ((root.data ?? root.instance ?? root) as Record<string, unknown>) ?? {};
  if (!str(raw.id)) {
    return { ok: false, code: "INVALID_RESPONSE", message: "A Stevo criou a instância sem retornar seu ID." };
  }
  return { ok: true, raw };
}

/**
 * Provisiona uma instância Stevo para um novo canal.
 *
 * 1. reaproveita uma instância livre que JÁ tenha servidor (server_url+token);
 * 2. caso contrário provisiona um novo servidor (ocupa um slot livre);
 * 3. inicia o servidor SM v2 e assina os eventos.
 */
export async function createStevoInstance(
  name: string,
  usedInstanceIds: string[] = [],
  company_id?: string,
): Promise<CreateStevoInstanceResult> {
  const apiKey = await resolveStevoApiKey({ company_id });
  if (!apiKey) {
    return { ok: false, code: "MISSING_API_KEY", message: "Configure o secret STEVO_API_KEY." };
  }

  const used = new Set(usedInstanceIds.filter(Boolean));

  // 1 — instância livre já provisionada
  const listed = await stevoGetWithRetry("/v1/instances", apiKey, null);
  let raw: Record<string, unknown> | null = null;
  if (!("networkError" in listed) && listed.ok) {
    const arr = Array.isArray((listed.json as { data?: unknown }).data)
      ? ((listed.json as { data: unknown[] }).data as Record<string, unknown>[])
      : [];
    raw =
      arr.find(
        (i) =>
          str(i.id) &&
          !used.has(str(i.id)!) &&
          i.connected !== true &&
          !str(i.phone_number) &&
          str(i.server_url) &&
          str(i.token),
      ) ?? null;
  }

  // 2 — nenhuma pronta: provisionar
  if (!raw) {
    const created = await provisionStevoServer(apiKey, name);
    if (!created.ok) return created;
    raw = created.raw;
  }

  const serverUrl = str(raw.server_url)?.replace(/\/+$/, "") ?? null;
  const token = str(raw.token);
  if (!serverUrl || !token) {
    return {
      ok: false,
      code: "INSTANCE_PROVISIONING",
      message: "A Stevo ainda está provisionando o servidor da instância. Tente sincronizar em instantes.",
    };
  }

  // 3 — ativar o servidor da instância
  const activated = await activateStevoServer(serverUrl, token);
  if (!activated.ok) return activated;

  return { ok: true, instance: toInstance(raw) };
}



/**
 * Detalhe cru da instância (inclui `server_url`, `token` e `instance_name`,
 * usados para obter o QR code diretamente do servidor da instância).
 */
export async function fetchStevoInstanceRaw(
  creds: StevoCreds | null,
): Promise<
  { ok: true; raw: Record<string, unknown> } | { ok: false; code: string; message: string }
> {
  const apiKey = await resolveStevoApiKey(creds);
  if (!apiKey) {
    return { ok: false, code: "MISSING_API_KEY", message: "Configure o secret STEVO_API_KEY." };
  }
  const instanceId = creds?.instance_id?.trim();
  if (!instanceId) {
    return { ok: false, code: "MISSING_CREDENTIALS", message: "Selecione a instância Stevo do canal." };
  }
  const r = await stevoGetWithRetry(`/v1/instances/${encodeURIComponent(instanceId)}`, apiKey, creds);
  if ("networkError" in r) {
    return { ok: false, code: "NETWORK_ERROR", message: "Falha de rede ao contatar a Stevo." };
  }
  if (!r.ok) {
    const code =
      r.status === 401 ? "UNAUTHORIZED" : r.status === 404 ? "INSTANCE_NOT_FOUND" : "STEVO_ERROR";
    return {
      ok: false,
      code,
      message:
        code === "UNAUTHORIZED"
          ? "API Key da Stevo inválida ou sem permissão."
          : code === "INSTANCE_NOT_FOUND"
            ? "Instância não encontrada nesta conta Stevo."
            : `Stevo respondeu ${r.status}.`,
    };
  }
  return { ok: true, raw: ((r.json as { data?: unknown }).data ?? {}) as Record<string, unknown> };
}

export type StevoQrResult =
  | { ok: true; connected: true; instanceId?: string }
  | {
      ok: true;
      connected: false;
      qr: string | null;
      qrImage: string | null;
      pairingCode: string | null;
      instanceId?: string;
    }
  | { ok: false; code: string; message: string };


function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**

 * Verifica no servidor da própria instância se a sessão do WhatsApp está
 * realmente pareada (`LoggedIn`). A flag `connected` da API de gestão indica
 * apenas que o servidor SM v2 está de pé — ela fica `true` mesmo sem nenhum
 * celular pareado, o que fazia o canal aparecer como conectado sem estar.
 *
 * Retorna `null` quando não foi possível verificar (sem servidor ou rede).
 */
export async function verifyStevoLoggedIn(
  raw: Record<string, unknown>,
): Promise<boolean | null> {
  const serverUrl = str(raw.server_url)?.replace(/\/+$/, "") ?? null;
  const token = str(raw.token);
  if (!serverUrl || !token) return null;
  // Duas tentativas: evita marcar o canal como desconectado por um soluço de rede.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${serverUrl}/instance/status`, { headers: { apikey: token } });
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          data?: { LoggedIn?: boolean; loggedIn?: boolean };
        };
        const flag = json.data?.LoggedIn ?? json.data?.loggedIn;
        if (typeof flag === "boolean") return flag;
      } else if (res.status === 401 || res.status === 404) {
        // Sessão/instância não existe mais no servidor → desconectado de fato.
        return false;
      }
    } catch {
      // tenta de novo
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}


/**
 * Garante que a instância do canal tenha servidor SM v2 ativo.
 *
 * Slots "vazios" da conta Stevo não têm `server_url`/`token` e a API de gestão
 * não expõe rota de start; quem provisiona é `POST /v1/instances`
 * (`engine: "smv2"`), que ocupa um slot livre. Nesse caso o `instance_id` pode
 * mudar — devolvemos o novo id para o chamador persistir no canal.
 */
async function ensureStevoServerReady(
  creds: StevoCreds | null,
): Promise<
  | { ok: true; raw: Record<string, unknown>; serverUrl: string; token: string; instanceId: string }
  | { ok: false; code: string; message: string }
> {
  const apiKey = await resolveStevoApiKey(creds);
  if (!apiKey) {
    return { ok: false, code: "MISSING_API_KEY", message: "Configure o secret STEVO_API_KEY." };
  }

  const detail = await fetchStevoInstanceRaw(creds);
  let raw: Record<string, unknown> | null = detail.ok ? detail.raw : null;
  let serverUrl = raw ? (str(raw.server_url)?.replace(/\/+$/, "") ?? null) : null;
  let token = raw ? str(raw.token) : null;

  if (!serverUrl || !token) {
    // Instância sem servidor: provisiona um agora (ocupa um slot livre da conta).
    const provisioned = await provisionStevoServer(
      apiKey,
      str(raw?.name) ?? `Zenda_${Date.now()}`,
    );
    if (!provisioned.ok) return provisioned;
    raw = provisioned.raw;
    serverUrl = str(raw.server_url)?.replace(/\/+$/, "") ?? null;
    token = str(raw.token);
  }

  if (!raw || !serverUrl || !token) {
    return {
      ok: false,
      code: "QR_UNAVAILABLE",
      message:
        "A Stevo ainda está provisionando o servidor desta instância. Tente gerar o QR novamente em instantes.",
    };
  }

  await activateStevoServer(serverUrl, token);
  return {
    ok: true,
    raw,
    serverUrl,
    token,
    instanceId: str(raw.id) ?? creds?.instance_id?.trim() ?? "",
  };
}


/** Desconecta/desloga a sessão ativa de WhatsApp no servidor SM v2 da instância. */
export async function logoutStevoServer(
  serverUrl: string,
  token: string,
): Promise<boolean> {
  const headers = { apikey: token, "Content-Type": "application/json" };
  try {
    await fetch(`${serverUrl}/instance/logout`, { method: "POST", headers }).catch(() => {});
    await fetch(`${serverUrl}/instance/logout`, { method: "DELETE", headers }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function logoutStevoInstance(
  creds: StevoCreds | null,
): Promise<{ ok: boolean }> {
  const detail = await fetchStevoInstanceRaw(creds);
  if (!detail.ok) return { ok: false };
  const serverUrl = str(detail.raw.server_url)?.replace(/\/+$/, "") ?? null;
  const token = str(detail.raw.token);
  if (!serverUrl || !token) return { ok: false };
  const ok = await logoutStevoServer(serverUrl, token);
  return { ok };
}

/**
 * QR code de pareamento da instância Stevo.
 *
 * A API de gestão não devolve QR, mas expõe `server_url` + `token` do servidor
 * da instância (StevoManager v2), que responde `GET /instance/qr`.
 *
 * Se `forceNew === true`, desloga qualquer sessão ativa prévia no servidor
 * para forçar a emissão de um QR code virgem.
 */
export async function getStevoQrCode(
  creds: StevoCreds | null,
  forceNew = false,
): Promise<StevoQrResult> {
  const ready = await ensureStevoServerReady(creds);
  if (!ready.ok) return ready;
  const { serverUrl, token, instanceId } = ready;

  const headers = { apikey: token, "Content-Type": "application/json" };

  if (forceNew) {
    await logoutStevoServer(serverUrl, token);
  }

  try {
    if (!forceNew) {
      const statusRes = await fetch(`${serverUrl}/instance/status`, { headers });
      const statusJson = (await statusRes.json().catch(() => ({}))) as {
        data?: { LoggedIn?: boolean; Connected?: boolean };
      };
      if (statusJson.data?.LoggedIn === true) return { ok: true, connected: true, instanceId };
    }

    // O servidor pode levar alguns segundos para emitir o primeiro QR após o start/logout.
    let qrImage: string | null = null;
    let code: string | null = null;
    let pairing: string | null = null;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`${serverUrl}/instance/qr`, { headers });
      lastStatus = r.status;
      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const data = (json.data ?? json) as Record<string, unknown>;
      qrImage = str(data.Qrcode) ?? str(data.qrcode) ?? str(data.base64);
      code = str(data.Code) ?? str(data.code);
      pairing = str(data.PairingCode) ?? str(data.pairingCode);
      if (qrImage || code) break;
      await sleep(2000);
    }

    if (!qrImage && !code) {
      return {
        ok: false,
        code: "QR_UNAVAILABLE",
        message: `O servidor da instância não retornou QR code (HTTP ${lastStatus}). Tente novamente em instantes.`,
      };
    }

    return { ok: true, connected: false, qr: code, qrImage, pairingCode: pairing, instanceId };

  } catch {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "Falha de rede ao contatar o servidor da instância.",
    };
  }
}





/**
 * Teste de conexão: detalhe da instância configurada no canal.
 *
 * `connected` só é `true` quando o servidor da instância confirma `LoggedIn`
 * (celular realmente pareado). `verified` indica se essa confirmação foi
 * possível — quando `false`, o chamador deve preservar o status atual em vez
 * de marcar o canal como desconectado.
 */
export async function testStevoInstance(creds: StevoCreds | null): Promise<
  | {
      ok: true;
      instance: StevoInstance;
      verified: boolean;
      /** Flag `connected` da API de gestão (servidor SM v2 de pé). */
      serverConnected: boolean;
      /** `true` quando a instância sequer tem servidor/token para checar sessão. */
      noSession: boolean;
    }
  | { ok: false; code: string; message: string }
> {
  const apiKey = await resolveStevoApiKey(creds);
  if (!apiKey) {
    return { ok: false, code: "MISSING_API_KEY", message: "Configure o secret STEVO_API_KEY." };
  }
  const instanceId = creds?.instance_id?.trim();
  if (!instanceId) {
    return { ok: false, code: "MISSING_CREDENTIALS", message: "Selecione a instância Stevo do canal." };
  }
  const r = await stevoGetWithRetry(`/v1/instances/${encodeURIComponent(instanceId)}`, apiKey, creds);
  if ("networkError" in r) {
    return { ok: false, code: "NETWORK_ERROR", message: "Falha de rede ao contatar a Stevo." };
  }
  if (!r.ok) {
    const code =
      r.status === 401 ? "UNAUTHORIZED" : r.status === 404 ? "INSTANCE_NOT_FOUND" : "STEVO_ERROR";
    const message =
      code === "UNAUTHORIZED"
        ? "API Key da Stevo inválida ou sem permissão."
        : code === "INSTANCE_NOT_FOUND"
          ? "Instância não encontrada nesta conta Stevo."
          : `Stevo respondeu ${r.status}.`;
    return { ok: false, code, message };
  }
  const i = ((r.json as { data?: unknown }).data ?? {}) as Record<string, unknown>;

  // A flag `connected` da API de gestão só significa "servidor SM v2 de pé".
  // A verdade sobre o pareamento é o `LoggedIn` do servidor da instância.
  let loggedIn = await verifyStevoLoggedIn(i);
  let serverConnected = i.connected === true;
  const noSession = !str(i.server_url) || !str(i.token);

  // Auto-healing (Auto-Reconexão): Se a instância possui servidor/token configurados,
  // mas o container SM v2 caiu ou dormiu (serverConnected === false), tenta reativar
  // o container na Stevo para manter a conexão ativa antes de alterar o status.
  if (!noSession && !serverConnected) {
    const serverUrl = str(i.server_url)?.replace(/\/+$/, "") ?? null;
    const token = str(i.token);
    if (serverUrl && token) {
      const act = await activateStevoServer(serverUrl, token);
      if (act.ok) {
        serverConnected = true;
        loggedIn = await verifyStevoLoggedIn(i);
      }
    }
  }

  return {
    ok: true,
    verified: loggedIn !== null,
    serverConnected,
    noSession,
    instance: {
      id: String(i.id ?? instanceId),
      name: typeof i.name === "string" ? i.name : null,
      status: typeof i.status === "string" ? i.status : null,
      phone: typeof i.phone_number === "string" ? i.phone_number : null,
      engine: typeof i.engine === "string" ? i.engine : null,
      connected: loggedIn === true,
    },
  };




}

function toStevoBody(payload: SendPayload): Record<string, unknown> {
  const to = payload.to.replace(/[^0-9]/g, "");
  if (payload.type === "text") return { to, text: payload.body };
  const mediaType =
    payload.type === "image" ? "image" : payload.type === "video" ? "video" : payload.type === "audio" ? "audio" : "document";
  const body: Record<string, unknown> = { to, media_url: payload.mediaUrl, media_type: mediaType };
  if ("caption" in payload && payload.caption) body.caption = payload.caption;
  if ("filename" in payload && payload.filename) body.filename = payload.filename;
  return body;
}

function extractMessageId(json: unknown): string {
  const root = (json ?? {}) as Record<string, unknown>;
  const result = (root.result ?? root.data ?? root) as Record<string, unknown>;
  const key = (result.key ?? {}) as Record<string, unknown>;
  const candidates = [result.id, key.id, root.id, (result.message as Record<string, unknown> | undefined)?.id];
  const found = candidates.find((c) => typeof c === "string" && c);
  return typeof found === "string" ? found : "";
}

/** Envia UMA mensagem pela instância Stevo (proxy `/v1/instances/{id}/messages`). */
export async function sendViaStevo(creds: StevoCreds, payload: SendPayload): Promise<SendResult> {
  const apiKey = await resolveStevoApiKey(creds);
  const instanceId = creds.instance_id?.trim();
  if (!apiKey || !instanceId) {
    return { ok: false, error: "Credenciais da Stevo não configuradas", request: {} };
  }
  const body = toStevoBody(payload);
  try {
    const r = await stevoFetch(`/v1/instances/${encodeURIComponent(instanceId)}/messages`, apiKey, {
      method: "POST",
      body: JSON.stringify(body),
      creds,
    });
    if (!r.ok) {
      const err = (r.json as { error?: { message?: string }; message?: string }) ?? {};
      return {
        ok: false,
        error: err.error?.message ?? err.message ?? `Stevo respondeu ${r.status}`,
        request: body,
        response: r.json,
        http_status: r.status,
      };
    }
    return {
      ok: true,
      provider_message_id: extractMessageId(r.json),
      request: body,
      response: r.json,
      http_status: r.status,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      request: body,
    };
  }
}

/**
 * Registra (ou atualiza) a URL de webhook da instância no servidor SM v2.
 * `POST /instance/connect` aceita `webhookUrl` + `subscribe`, e é idempotente
 * para instâncias já conectadas.
 */
export async function setStevoWebhook(
  creds: StevoCreds | null,
  webhookUrl: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const ready = await ensureStevoServerReady(creds);
  if (!ready.ok) return ready;
  const { serverUrl, token, instanceId } = ready;


  try {
    const headers = { apikey: token, "Content-Type": "application/json" };
    const payload = {
      immediate: true,
      webhookUrl,
      webhook_url: webhookUrl,
      url: webhookUrl,
      webhook: { url: webhookUrl, enabled: true, events: STEVO_WEBHOOK_EVENTS },
      subscribe: STEVO_WEBHOOK_EVENTS,
      events: STEVO_WEBHOOK_EVENTS,
    };

    const resConnect = await fetch(`${serverUrl}/instance/connect`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    // Tenta também a rota alternativa /webhook/set se a /instance/connect não for a primária da versão
    await fetch(`${serverUrl}/webhook/set`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }).catch(() => null);

    const apiKey = await resolveStevoApiKey(creds);
    if (apiKey && instanceId) {
      await stevoFetch(`/v1/instances/${encodeURIComponent(instanceId)}/webhook`, apiKey, {
        method: "POST",
        body: JSON.stringify({ webhook_url: webhookUrl, url: webhookUrl }),
        creds,
      }).catch(() => null);
    }

    if (!resConnect.ok && resConnect.status !== 200) {
      return { ok: false, code: "STEVO_ERROR", message: `Servidor da instância respondeu ${resConnect.status}.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Falha de rede ao configurar o webhook." };
  }
}

/** Dispara chamada de voz via Stevo Voice (proxy `/v1/instances/{id}/calls` ou `/v1/instances/{id}/voice`). */
export async function stevoMakeCall(
  creds: StevoCreds,
  phone: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const apiKey = await resolveStevoApiKey(creds);
  const instanceId = creds.instance_id?.trim();
  if (!apiKey || !instanceId) {
    return { ok: false, error: "Credenciais da Stevo não configuradas" };
  }

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const body = {
    phone: cleanPhone,
    number: cleanPhone,
    to: cleanPhone,
  };

  try {
    let r = await stevoFetch(`/v1/instances/${encodeURIComponent(instanceId)}/calls`, apiKey, {
      method: "POST",
      body: JSON.stringify(body),
      creds,
    });

    if (!r.ok) {
      r = await stevoFetch(`/v1/instances/${encodeURIComponent(instanceId)}/voice`, apiKey, {
        method: "POST",
        body: JSON.stringify(body),
        creds,
      });
    }

    if (!r.ok) {
      const ready = await ensureStevoServerReady(creds);
      if (ready.ok) {
        const direct = await fetch(`${ready.serverUrl}/call/offer`, {
          method: "POST",
          headers: { apikey: ready.token, "Content-Type": "application/json" },
          body: JSON.stringify({ number: cleanPhone, to: cleanPhone }),
        });
        if (direct.ok) return { ok: true, message: "Chamada iniciada com sucesso" };
      }

      const err = (r.json as { error?: { message?: string }; message?: string }) ?? {};
      return {
        ok: false,
        error: err.error?.message ?? err.message ?? `Stevo respondeu ${r.status}`,
      };
    }

    return { ok: true, message: "Chamada iniciada via Stevo Voice" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
