import { useState, useEffect } from "react";
import { Loader2, FileIcon, Play, ZoomIn, ImageOff, Download } from "lucide-react";
import { toast } from "sonner";

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
        if (cancelled) return;
        if (res?.url) setUrl(res.url);
        else setFailed(true);
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
  const [modalOpen, setModalOpen] = useState(false);

  if (failed) {
    return (
      <div className="flex h-32 w-48 flex-col items-center justify-center gap-1 rounded-xl border border-border/50 bg-muted/40 text-muted-foreground">
        <ImageOff className="h-5 w-5" />
        <span className="text-[11px]">Imagem indisponível</span>
      </div>
    );
  }

  if (!url) {
    return <div className="h-44 w-60 animate-pulse rounded-xl bg-muted/60" />;
  }

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className="group relative cursor-pointer overflow-hidden rounded-xl border border-border/40 bg-muted/30"
      >
        <img
          src={url}
          alt={alt}
          className="max-h-80 max-w-[320px] object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-6 w-6 text-white" />
        </div>
      </div>

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <img src={url} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
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
  const [downloading, setDownloading] = useState(false);

  let fileName = name || "";
  if (!fileName && path) {
    const raw = path.split("/").pop()?.split("?")[0] || "";
    fileName = raw;
  }
  if (!fileName) fileName = "Arquivo";

  let ext = "";
  if (fileName.includes(".")) {
    ext = fileName.split(".").pop()?.toUpperCase() || "";
  } else if (path.includes(".")) {
    const cleanPath = path.split("?")[0];
    ext = cleanPath.split(".").pop()?.toUpperCase() || "";
  }
  if (ext.length > 6 || /^[0-9a-f]{8,}$/i.test(ext)) {
    ext = "DOC";
  }
  const displayExt = ext ? ext : "DOC";

  const sizeLabel = size
    ? `${(size / 1024).toFixed(size > 1024 * 1024 ? 1 : 0)} ${size > 1024 * 1024 ? "MB" : "KB"}`
    : null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!url) return;
    setDownloading(true);
    toast.info(`Baixando ${fileName}...`);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      toast.success("Download concluído!");
    } catch {
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  if (!url) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="max-w-[180px] truncate">{fileName}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">{displayExt}</span>
      </div>
    );
  }

  return (
    <div
      onClick={handleDownload}
      role="button"
      tabIndex={0}
      title={`Clique para baixar ${fileName}`}
      className="group inline-flex cursor-pointer items-center gap-3 rounded-xl border border-border/50 bg-background/90 px-3.5 py-2.5 text-sm transition-all hover:border-primary/50 hover:bg-accent/80 hover:shadow-sm"
    >
      <div className="relative flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-[10px] tracking-wider uppercase">
        <FileIcon className="h-4 w-4 mb-0.5 opacity-80" />
        <span className="leading-none text-[8.5px] font-extrabold">{displayExt}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start">
        <span className="max-w-[190px] truncate font-medium text-foreground group-hover:text-primary transition-colors">
          {fileName}
        </span>
        <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.2 font-semibold text-primary uppercase text-[9.5px]">
            .{displayExt.toLowerCase()}
          </span>
          {sizeLabel && <span>· {sizeLabel}</span>}
        </div>
      </div>

      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all">
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </div>
    </div>
  );
}
