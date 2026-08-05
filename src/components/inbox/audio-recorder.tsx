import { useEffect, useRef, useState } from "react";
import { Mic, Square, Send, X, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";

interface Props {
  onSend: (blob: Blob, durationSec: number) => Promise<void> | void;
  onCancel: () => void;
}

export function AudioRecorder({ onSend, onCancel }: Props) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    try {
      if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador não permite gravar áudio. Envie um arquivo pelo anexo.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setBlob(b);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();
      setRecording(true);
      setDuration(0);
      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 250);
    } catch (err) {
      setError("Não foi possível acessar o microfone. Verifique as permissões.");
      console.error(err);
    }
  };


  const stop = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  };

  useEffect(() => {
    // auto-start on mount
    void start();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    if (!blob) return;
    setSending(true);
    try {
      await onSend(blob, duration);
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <span>{error}</span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Fechar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      {recording ? (
        <>
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
          </span>
          <span className="text-sm font-medium tabular-nums">{formatDuration(duration)}</span>
          <span className="text-xs text-muted-foreground">Gravando…</span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={stop}>
              <Square className="mr-1 h-3 w-3" /> Parar
            </Button>
          </div>
        </>
      ) : blob ? (
        <>
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-sm">Áudio pronto ({formatDuration(duration)})</span>
          <audio controls src={URL.createObjectURL(blob)} className="ml-2 h-8" />
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Enviar
            </Button>
          </div>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">Iniciando…</span>
      )}
    </div>
  );
}
