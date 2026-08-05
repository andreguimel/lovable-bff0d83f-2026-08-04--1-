/**
 * Camada única de anexos do sistema.
 *
 * Todo upload (Inbox, Flows, CRM, Base de conhecimento) passa por aqui para
 * ter as mesmas regras de validação, o mesmo formato de caminho no Storage
 * (`{company_id}/...` ou `{contact_id}/...`) e as mesmas mensagens de erro.
 */
import { supabase } from "@/integrations/supabase/client";

export type AttachmentKind = "image" | "audio" | "video" | "file";

export const ATTACHMENT_BUCKETS = {
  messageMedia: "message-media",
  agentKnowledge: "agent-knowledge",
  contactFiles: "contact-files",
  avatars: "avatars",
} as const;

export type AttachmentBucket =
  (typeof ATTACHMENT_BUCKETS)[keyof typeof ATTACHMENT_BUCKETS];

/** Limites por contexto (MB). */
export const ATTACHMENT_LIMITS = {
  inbox: 20,
  flow: 100,
  knowledge: 50,
  crm: 50,
} as const;

const BLOCKED_EXT = new Set([
  "exe", "bat", "cmd", "com", "msi", "sh", "ps1", "vbs", "scr", "jar",
  "app", "dll", "so", "dylib", "apk", "deb", "rpm",
]);

const BLOCKED_MIME_PREFIX = [
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
];

const ALLOWED_MIME_BY_KIND: Record<AttachmentKind, (m: string) => boolean> = {
  image: (m) => m.startsWith("image/"),
  audio: (m) => m.startsWith("audio/") || m.startsWith("video/webm"),
  video: (m) => m.startsWith("video/"),
  file: (m) =>
    m.startsWith("application/pdf") ||
    m.startsWith("application/vnd.") ||
    m.startsWith("application/msword") ||
    m.startsWith("application/zip") ||
    m.startsWith("application/x-zip") ||
    m.startsWith("text/") ||
    m.startsWith("image/") ||
    m.startsWith("audio/") ||
    m.startsWith("video/") ||
    m === "application/json" ||
    m === "application/octet-stream",
};

export const ACCEPT_BY_KIND: Record<AttachmentKind, string> = {
  image: "image/*",
  audio: "audio/*",
  video: "video/*",
  file: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,application/pdf",
};

/** Retorna a mensagem de erro, ou `null` quando o arquivo é válido. */
export function validateAttachment(
  file: File,
  kind: AttachmentKind,
  maxMb: number = ATTACHMENT_LIMITS.inbox,
): string | null {
  if (!file || file.size === 0) return "Arquivo vazio não permitido.";
  if (file.size > maxMb * 1024 * 1024) return `Arquivo excede ${maxMb}MB.`;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXT.has(ext)) return `Extensão .${ext} não permitida.`;

  const mime = (file.type || "").toLowerCase();
  if (mime && BLOCKED_MIME_PREFIX.some((p) => mime.startsWith(p))) {
    return `Tipo de arquivo (${mime}) não permitido.`;
  }
  if (mime && !ALLOWED_MIME_BY_KIND[kind](mime)) {
    return `Tipo ${mime} não é válido para "${kind}".`;
  }
  return null;
}

/** Deduz a categoria a partir do MIME do arquivo. */
export function kindFromFile(file: File): AttachmentKind {
  const m = (file.type || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

/** Extensão segura (com ponto) derivada do nome do arquivo. */
export function safeExtension(fileName: string, fallback = ""): string {
  const raw = fileName.includes(".") ? fileName.split(".").pop() : "";
  const clean = (raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean ? `.${clean}` : fallback ? `.${fallback}` : "";
}

/** Monta um caminho único: `prefixo/uuid.ext`. */
export function buildStoragePath(segments: string[], file: File): string {
  const base = segments.filter(Boolean).join("/");
  return `${base}/${crypto.randomUUID()}${safeExtension(file.name, "bin")}`;
}

export interface UploadResult {
  path: string;
  bucket: AttachmentBucket;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Faz o upload já validado. Lança `Error` com mensagem amigável em caso de
 * falha (inclusive bucket inexistente ou bloqueio de RLS).
 */
export async function uploadAttachment(params: {
  bucket: AttachmentBucket;
  segments: string[];
  file: File;
  kind?: AttachmentKind;
  maxMb?: number;
}): Promise<UploadResult> {
  const { bucket, segments, file } = params;
  const kind = params.kind ?? kindFromFile(file);
  const invalid = validateAttachment(file, kind, params.maxMb);
  if (invalid) throw new Error(invalid);

  const path = buildStoragePath(segments, file);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(friendlyStorageError(error.message, bucket));

  return {
    path,
    bucket,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

/** URL assinada para leitura (padrão: 1 hora). */
export async function createSignedAttachmentUrl(
  bucket: AttachmentBucket,
  path: string,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(friendlyStorageError(error?.message ?? "URL indisponível", bucket));
  }
  return data.signedUrl;
}

export function friendlyStorageError(message: string, bucket: string): string {
  const m = message.toLowerCase();
  if (m.includes("bucket not found")) {
    return `Armazenamento "${bucket}" não configurado. Fale com o administrador.`;
  }
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("403")) {
    return "Sem permissão para enviar este arquivo.";
  }
  if (m.includes("payload too large") || m.includes("exceeded")) {
    return "Arquivo muito grande para o armazenamento.";
  }
  return message;
}
