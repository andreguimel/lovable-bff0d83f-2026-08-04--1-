/**
 * Download + descriptografia de mídia recebida do WhatsApp.
 *
 * As URLs entregues no webhook (`https://mmg.whatsapp.net/...enc`) apontam para
 * o arquivo CRIPTOGRAFADO. Sem descriptografar, o browser não consegue exibir a
 * imagem nem tocar o áudio. Aqui baixamos o `.enc`, derivamos as chaves com
 * HKDF-SHA256 a partir do `mediaKey` e devolvemos os bytes originais.
 */

type MediaKind = "image" | "audio" | "video" | "file";

const HKDF_INFO: Record<MediaKind, string> = {
  image: "WhatsApp Image Keys",
  audio: "WhatsApp Audio Keys",
  video: "WhatsApp Video Keys",
  file: "WhatsApp Document Keys",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

export function isEncryptedWhatsAppUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /whatsapp\.net\//i.test(url) && /\.enc(\?|$)/i.test(url);
}

function baseMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0]!.trim().toLowerCase();
}

export function extensionFor(mime: string | null | undefined, kind: MediaKind): string {
  const found = EXT_BY_MIME[baseMime(mime)];
  if (found) return found;
  return kind === "image" ? "jpg" : kind === "audio" ? "ogg" : kind === "video" ? "mp4" : "bin";
}

function b64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Baixa o `.enc` e devolve os bytes decifrados (AES-256-CBC + HKDF). */
export async function downloadAndDecryptWhatsAppMedia(params: {
  url: string;
  mediaKeyB64: string;
  kind: MediaKind;
}): Promise<Uint8Array> {
  const res = await fetch(params.url);
  if (!res.ok) throw new Error(`Falha ao baixar mídia (${res.status})`);
  const encrypted = new Uint8Array(await res.arrayBuffer());
  if (encrypted.byteLength <= 10) throw new Error("Arquivo de mídia vazio");

  const mediaKey = b64ToBytes(params.mediaKeyB64);
  const hkdfKey = await crypto.subtle.importKey("raw", mediaKey as BufferSource, "HKDF", false, ["deriveBits"]);
  const expanded = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: new TextEncoder().encode(HKDF_INFO[params.kind]),
      },
      hkdfKey,
      112 * 8,
    ),
  );

  const iv = expanded.slice(0, 16);
  const cipherKey = expanded.slice(16, 48);
  const ciphertext = encrypted.slice(0, encrypted.byteLength - 10); // remove MAC (10 bytes)

  const aesKey = await crypto.subtle.importKey("raw", cipherKey as BufferSource, { name: "AES-CBC" }, false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv as BufferSource }, aesKey, ciphertext as BufferSource);
  return new Uint8Array(plain);
}

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: ArrayBuffer | Uint8Array | Blob,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Descriptografa e persiste a mídia em `message-media`, devolvendo o path do
 * objeto (que o app assina depois). Retorna `null` quando não é possível.
 */
export async function persistInboundWhatsAppMedia(
  client: StorageClient,
  params: {
    companyId: string;
    kind: MediaKind;
    mediaUrl: string;
    metadata: Record<string, unknown> | null;
  },
): Promise<string | null> {
  const mediaKey = typeof params.metadata?.mediaKey === "string" ? (params.metadata.mediaKey as string) : null;
  if (!mediaKey || !isEncryptedWhatsAppUrl(params.mediaUrl)) return null;

  try {
    const bytes = await downloadAndDecryptWhatsAppMedia({
      url: params.mediaUrl,
      mediaKeyB64: mediaKey,
      kind: params.kind,
    });
    const mime = typeof params.metadata?.mimetype === "string" ? (params.metadata.mimetype as string) : null;
    const ext = extensionFor(mime, params.kind);
    const path = `${params.companyId}/inbound/${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from("message-media").upload(path, bytes, {
      contentType: baseMime(mime) || "application/octet-stream",
      upsert: false,
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}
