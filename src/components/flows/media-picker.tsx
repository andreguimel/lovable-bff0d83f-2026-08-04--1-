import { useEffect, useRef, useState } from "react";
import { Upload, X, FileText, Play as PlayIcon, Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCEPT_BY_KIND,
  ATTACHMENT_BUCKETS,
  ATTACHMENT_LIMITS,
  createSignedAttachmentUrl,
  uploadAttachment,
  type AttachmentKind,
} from "@/lib/attachments";

export type MediaKind = "image" | "audio" | "video" | "document";

interface MediaValue {
  url?: string;
  filename?: string;
  mime_type?: string;
  size?: number;
}

const ACCEPT: Record<MediaKind, string> = {
  image: ACCEPT_BY_KIND.image,
  audio: ACCEPT_BY_KIND.audio,
  video: ACCEPT_BY_KIND.video,
  document: ACCEPT_BY_KIND.file,
};

const ATTACHMENT_KIND: Record<MediaKind, AttachmentKind> = {
  image: "image",
  audio: "audio",
  video: "video",
  document: "file",
};

const MAX_MB = ATTACHMENT_LIMITS.flow;


export function MediaPicker({
  kind,
  value,
  onChange,
  flowId,
}: {
  kind: MediaKind;
  value: MediaValue;
  onChange: (v: MediaValue) => void;
  flowId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Audio recorder state ----
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function handleFile(file: File) {
    setUploading(true);
    setProgress(10);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const { data: prof } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!prof?.company_id) throw new Error("Empresa não encontrada.");

      setProgress(30);
      const up = await uploadAttachment({
        bucket: ATTACHMENT_BUCKETS.messageMedia,
        segments: [prof.company_id, "flows", flowId],
        file,
        kind: ATTACHMENT_KIND[kind],
        maxMb: MAX_MB,
      });
      setProgress(80);

      // URL assinada com validade longa (1 ano) para assets internos de fluxo
      const url = await createSignedAttachmentUrl(up.bucket, up.path, 60 * 60 * 24 * 365);

      onChange({
        url,
        filename: up.filename,
        mime_type: up.mimeType,
        size: up.size,
      });
      setProgress(100);
      toast.success("Arquivo enviado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 400);
    }
  }


  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Gravação de áudio não suportada neste navegador.");
      return;
    }
    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
      toast.error("MediaRecorder não disponível neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mimeType = preferred.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setRecording(false);
        setElapsed(0);
        if (file.size === 0) {
          toast.error("Gravação vazia.");
          return;
        }
        await handleFile(file);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Falha ao acessar microfone: ${e.message}`
          : "Falha ao acessar microfone",
      );
    }
  }

  function stopRecording() {
    try {
      recorderRef.current?.stop();
    } catch {
      // no-op
    }
  }

  function fmt(sec: number) {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return (
    <div className="grid gap-2">
      {value.url ? (
        <div className="rounded-lg border border-border/60 bg-card/60 p-2">
          {kind === "image" && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={value.url} className="mx-auto max-h-40 rounded object-contain" alt="preview" />
          )}
          {kind === "audio" && (
            <audio controls src={value.url} className="w-full">
              <track kind="captions" />
            </audio>
          )}
          {kind === "video" && (
            <video controls src={value.url} className="max-h-40 w-full rounded">
              <track kind="captions" />
            </video>
          )}
          {kind === "document" && (
            <div className="flex items-center gap-2 text-xs">
              <FileText className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="truncate font-medium">{value.filename ?? "arquivo"}</p>
                {value.size && (
                  <p className="text-[10px] text-muted-foreground">
                    {(value.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 flex justify-between gap-2">
            <a
              href={value.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary hover:underline"
            >
              Abrir
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange({})}
              className="h-6 px-2 text-[11px] text-destructive"
            >
              <X className="mr-1 h-3 w-3" /> Remover
            </Button>
          </div>
        </div>
      ) : (
        <>
          {kind === "audio" && (
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <Mic
                    className={
                      recording ? "h-4 w-4 text-destructive animate-pulse" : "h-4 w-4 text-primary"
                    }
                  />
                  <span className="font-medium">
                    {recording ? "Gravando…" : "Gravar áudio"}
                  </span>
                  {recording && (
                    <span className="tabular-nums text-[11px] text-muted-foreground">
                      {fmt(elapsed)}
                    </span>
                  )}
                </div>
                {recording ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={stopRecording}
                    className="h-7 px-2 text-[11px]"
                  >
                    <Square className="mr-1 h-3 w-3" /> Parar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={startRecording}
                    disabled={uploading}
                    className="h-7 px-2 text-[11px]"
                  >
                    <Mic className="mr-1 h-3 w-3" /> Iniciar gravação
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Permita o acesso ao microfone. Ao parar, o áudio é enviado automaticamente.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border/60 bg-card/40 py-6 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
            disabled={uploading || recording}
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span>Enviando… {progress}%</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span>
                  {kind === "audio"
                    ? "Ou enviar arquivo de áudio"
                    : `Clique para enviar ${labelFor(kind)}`}
                </span>
                <span className="text-[10px]">Máx {MAX_MB}MB</span>
              </>
            )}
          </button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="grid gap-1.5">
        <Label className="text-[11px] text-muted-foreground">Ou cole uma URL externa</Label>
        <Input
          value={value.url && !value.url.includes("/storage/") ? value.url : ""}
          onChange={(e) =>
            onChange({ ...value, url: e.target.value, filename: value.filename ?? "external" })
          }
          placeholder="https://…"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

function labelFor(k: MediaKind) {
  switch (k) {
    case "image":
      return "imagem";
    case "audio":
      return "áudio";
    case "video":
      return "vídeo";
    case "document":
      return "arquivo";
  }
}

export { PlayIcon };
