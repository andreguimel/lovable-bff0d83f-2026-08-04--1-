import { useState, useEffect } from "react";
import { Loader2, FileIcon, Play, ZoomIn, ImageOff } from "lucide-react";

import { getMediaUrl } from "@/lib/inbox.functions";
import { useServerFn } from "@tanstack/react-start";
import { AudioMessage } from "./audio-message";

interface Props {
  path: string;
  messageId?: string;
  alt?: string;
}

/** Resolve o path/URL da mídia em uma URL utilizável pelo browser. */
function useMediaUrl(path: string, messageId?: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const get = useServerFn(getMediaUrl);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    get({ data: { path, messageId } })
      .then((res) => {
        if (!cancelled) setUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path, messageId, get]);

  return { url, failed };
}

export function MediaImage({ path, messageId, alt = "" }: Props) {
  const { url, failed } = useMediaUrl(path, messageId);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);

  if (failed || broken) {
    return (
      <div className="flex h-24 w-64 flex-col items-center justify-center gap-1 rounded-xl border border-border/50 bg-muted/40 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        <span>Não foi possível carregar a imagem</span>
      </div>
    );
  }
  if (!url) return <div className="h-44 w-64 animate-pulse rounded-xl bg-muted/60" />;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative block overflow-hidden rounded-xl ring-1 ring-border/40 transition-transform hover:scale-[1.01]"
      >
        <img
          src={url}
          alt={alt}
          onError={() => setBroken(true)}
          className="max-h-72 max-w-[320px] object-cover"
        />
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/25 group-hover:opacity-100">
          <ZoomIn className="h-6 w-6 drop-shadow" />
        </span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur"
          onClick={() => setOpen(false)}
        >
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
    </>
  );
}

export function MediaAudio({ path, messageId }: { path: string; messageId?: string }) {
  const { url, failed } = useMediaUrl(path, messageId);
  if (failed)
    return (
      <div className="flex h-10 min-w-[240px] items-center justify-center rounded-full bg-muted/50 px-4 text-xs text-muted-foreground">
        Áudio indisponível
      </div>
    );
  if (!url)
    return (
      <div className="flex h-10 w-60 items-center justify-center rounded-full bg-muted/60">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  return <AudioMessage url={url} />;
}

export function MediaVideo({ path, messageId }: { path: string; messageId?: string }) {
  const { url, failed } = useMediaUrl(path, messageId);
  if (failed)
    return (
      <div className="flex h-24 w-64 items-center justify-center rounded-xl border border-border/50 bg-muted/40 text-xs text-muted-foreground">
        Vídeo indisponível
      </div>
    );
  if (!url) return <div className="h-44 w-64 animate-pulse rounded-xl bg-muted/60" />;
  return (
    <div className="relative overflow-hidden rounded-xl ring-1 ring-border/40">
      <video controls src={url} className="max-h-72 max-w-[320px]" />
      <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100">
        <Play className="h-8 w-8 text-white drop-shadow" />
      </span>
    </div>
  );
}

export function MediaFile({
  path,
  messageId,
  name,
  size,
}: {
  path: string;
  messageId?: string;
  name?: string;
  size?: number;
}) {
  const { url } = useMediaUrl(path, messageId);
  const sizeLabel = size ? `${(size / 1024).toFixed(size > 1024 * 1024 ? 1 : 0)} ${size > 1024 * 1024 ? "MB" : "KB"}` : null;
  if (!url) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="max-w-[180px] truncate">{name ?? "Arquivo"}</span>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={name}
      className="inline-flex items-center gap-3 rounded-xl border border-border/50 bg-background/70 px-3 py-2.5 text-sm transition-all hover:border-primary/40 hover:bg-accent"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <FileIcon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span className="max-w-[200px] truncate font-medium">{name ?? "Arquivo"}</span>
        {sizeLabel && <span className="text-[10px] text-muted-foreground">{sizeLabel}</span>}
      </span>
    </a>
  );
}
