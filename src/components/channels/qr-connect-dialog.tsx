import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Smartphone, TimerReset } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  startChannelSession,
  getChannel,
  finalizeChannelSession,
  syncStevoChannel,
  updateChannel,
} from "@/lib/channels.functions";

interface Props {
  channelId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function QrConnectDialog({ channelId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const start = useServerFn(startChannelSession);
  const getCh = useServerFn(getChannel);
  const finalize = useServerFn(finalizeChannelSession);
  const syncStevo = useServerFn(syncStevoChannel);
  const updateCh = useServerFn(updateChannel);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [stevoQrImage, setStevoQrImage] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const successNotified = useRef(false);
  const detail = useQuery({
    queryKey: ["channel", channelId],
    queryFn: () => getCh({ data: { id: channelId! } }),
    enabled: !!channelId && open,
    refetchInterval: open ? 2000 : false,
  });

  const status = detail.data?.channel.status;
  const qrString = detail.data?.channel.qr_code;
  const isStevo = detail.data?.channel.provider_type === "stevo";

  const syncMut = useMutation({
    mutationFn: () => syncStevo({ data: { id: channelId! } }),
    onSuccess: (res) => {
      setSyncMsg(res.connected ? res.message : null);
      if (res.connected) toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (e: Error) => {
      setSyncMsg(e.message);
    },
  });

  useEffect(() => {
    if (!qrString || stevoQrImage) {
      if (!qrString) setQrDataUrl(null);
      return;
    }
    if (
      qrString.startsWith("data:") ||
      qrString.startsWith("http://") ||
      qrString.startsWith("https://")
    ) {
      setQrDataUrl(qrString);
      return;
    }
    QRCode.toDataURL(qrString, { width: 320, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [qrString, stevoQrImage]);

  const startMut = useMutation({
    mutationFn: (args?: { force?: boolean } | void) => start({ data: { id: channelId!, force: args?.force ?? undefined } }),
    onMutate: () => {
      setStarting(true);
      setQrError(null);
      setExpired(false);
    },
    onSuccess: (res) => {
      setStevoQrImage(res.qr_image ?? null);
      setPairingCode(res.pairing_code ?? null);
      setExpiresAt(res.expires_at ? new Date(res.expires_at).getTime() : null);
      setQrError(null);
      setSyncMsg(null);
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (e: Error) => {
      setStarting(false);
      setQrError(e.message);
      toast.error(e.message);
    },
    onSettled: () => setStarting(false),
  });

  const regenerate = useCallback(() => {
    if (!channelId || startMut.isPending) return;
    setStevoQrImage(null);
    setPairingCode(null);
    setQrDataUrl(null);
    setSyncMsg(null);
    startMut.mutate({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, startMut.isPending]);

  // Gera o QR ao abrir. Só tenta uma vez: se falhar, o usuário reexecuta pelo botão.
  useEffect(() => {
    if (
      open &&
      channelId &&
      status &&
      status !== "connected" &&
      !qrString &&
      !qrError &&
      !expired &&
      !startMut.isPending
    ) {
      startMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channelId, status, qrString, qrError, expired]);

  useEffect(() => {
    if (!open) {
      setSyncMsg(null);
      setQrError(null);
      setStevoQrImage(null);
      setPairingCode(null);
      setExpiresAt(null);
      setExpired(false);
      successNotified.current = false;
    }
  }, [open]);

  // Contagem regressiva de expiração do QR.
  useEffect(() => {
    if (!open || !expiresAt || expired || status === "connected") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, expiresAt, expired, status]);

  useEffect(() => {
    if (!expiresAt || expired || status === "connected") return;
    if (now >= expiresAt) {
      setExpired(true);
      setStevoQrImage(null);
      setQrDataUrl(null);
      toast.error("QR Code expirado. Gere um novo para continuar.");
    }
  }, [now, expiresAt, expired, status]);

  // Stevo: só faz polling de pareamento enquanto há QR válido na tela.
  useEffect(() => {
    if (!open || !channelId || !isStevo || status === "connected" || expired) return;
    if (!stevoQrImage && !qrString) return;
    const t = setInterval(() => {
      if (!syncMut.isPending) syncMut.mutate();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channelId, isStevo, status, stevoQrImage, qrString, expired]);

  // Simulate pairing: 8s after QR appears, call finalize server-side.
  useEffect(() => {
    if (!open || !channelId || isStevo || !qrString || status !== "connecting") return;
    const t = setTimeout(() => {
      finalize({ data: { id: channelId } })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["channel", channelId] });
          qc.invalidateQueries({ queryKey: ["channels"] });
        })
        .catch(() => {});
    }, 8000);
    return () => clearTimeout(t);
  }, [open, channelId, isStevo, qrString, status, finalize, qc]);

  useEffect(() => {
    if (status === "connected") {
      if (!successNotified.current) {
        successNotified.current = true;
        toast.success("Conexão estabelecida com sucesso!");
      }
      const t = setTimeout(() => {
        onOpenChange(false);
        qc.invalidateQueries({ queryKey: ["channels"] });
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [status, onOpenChange, qc]);

  const qrImage = expired ? null : (stevoQrImage ?? qrDataUrl);
  const remaining = expiresAt ? expiresAt - now : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isStevo ? "Conexão Stevo" : "Conectar WhatsApp"}</DialogTitle>
          <DialogDescription>
            Escaneie o QR Code com o WhatsApp do celular para autenticar esta instância.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4" aria-live="polite">
          {status === "connected" ? (
            <div className="flex flex-col items-center gap-3 py-8 animate-in fade-in zoom-in duration-300">
              <div className="rounded-full bg-success/15 p-4">
                <CheckCircle2 className="h-12 w-12 text-success" />
              </div>
              <p className="text-lg font-semibold">Conexão estabelecida com sucesso!</p>
              <p className="text-sm text-muted-foreground">Voltando para a lista de conexões...</p>
              <Button onClick={() => onOpenChange(false)}>Continuar</Button>
            </div>
          ) : qrImage ? (
            <>
              <div className="rounded-2xl border bg-white p-4">
                <img
                  src={qrImage}
                  alt="QR Code para conectar a instância ao WhatsApp"
                  className="h-56 w-56 sm:h-64 sm:w-64"
                />
              </div>
              {remaining !== null && (
                <p className="flex items-center gap-2 text-sm font-medium tabular-nums">
                  <TimerReset className="h-4 w-4 text-muted-foreground" />
                  Expira em {formatRemaining(remaining)}
                </p>
              )}
              {pairingCode && (
                <p className="text-sm text-muted-foreground">
                  Ou use o código de pareamento: <b className="tracking-widest">{pairingCode}</b>
                </p>
              )}
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Smartphone className="h-4 w-4 shrink-0" /> Abra o WhatsApp no celular</li>
                <li>2. Toque em <b>Menu</b> → <b>Aparelhos conectados</b></li>
                <li>3. Toque em <b>Conectar um aparelho</b> e aponte a câmera</li>
              </ol>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Aguardando pareamento...
              </div>
            </>
          ) : expired ? (
            <div className="flex w-full flex-col items-center gap-4 py-6">
              <AlertTriangle className="h-10 w-10 text-warning" />
              <p className="text-center text-sm">
                QR Code expirado. Gere um novo QR Code para tentar novamente.
              </p>
              <Button onClick={regenerate} disabled={starting}>
                <RefreshCw className={`mr-1 h-4 w-4 ${starting ? "animate-spin" : ""}`} />
                Gerar novo QR Code
              </Button>
            </div>
          ) : qrError || syncMsg ? (
            <div className="flex w-full flex-col gap-4 py-2">
              <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{qrError ?? syncMsg}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                O sistema tentará iniciar a instância novamente ao gerar um novo QR Code.
              </p>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-3 py-8">
              <Skeleton className="h-56 w-56 rounded-2xl sm:h-64 sm:w-64" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando QR Code... Por favor, aguarde.
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {isStevo && (
            <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              <RefreshCw className={`mr-1 h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
          )}
          {status !== "connected" && (
            <Button variant="outline" onClick={regenerate} disabled={starting}>
              {starting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Gerar novo QR
            </Button>
          )}

          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
