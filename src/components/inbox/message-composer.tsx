import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Paperclip,
  Send,
  Mic,
  Loader2,
  Zap,
  Smile,
  Phone,
  Check,
  Image as ImageIcon,
  Video,
  FileText,
  Sparkles,
} from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  sendMessage,
  listQuickReplies,
  getReplyChannelContext,
} from "@/lib/inbox.functions";
import { AudioRecorder } from "./audio-recorder";
import { ReplyPreview } from "./reply-preview";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FlowAgentPickerPopover } from "./flow-agent-picker-dialog";

// INBOX FINALIZATION 01 — validação e upload centralizados em @/lib/attachments
import {
  ATTACHMENT_BUCKETS,
  ATTACHMENT_LIMITS,
  uploadAttachment,
  validateAttachment,
} from "@/lib/attachments";


interface Props {
  conversationId: string;
  contactName: string;
  companyId: string;
  replyingTo?: import("./reply-preview").ReplyPreviewMessage | null;
  onClearReply?: () => void;
}


export function MessageComposer({ conversationId, contactName, companyId, replyingTo, onClearReply }: Props) {
  const [text, setText] = useState("");
  const [showRecorder, setShowRecorder] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachAccept, setAttachAccept] = useState<string>("image/*,video/*,application/pdf");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();

  const send = useServerFn(sendMessage);
  const listQR = useServerFn(listQuickReplies);
  const getChannelCtx = useServerFn(getReplyChannelContext);

  const { data: quickReplies = [] } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => listQR(),
  });

  // INBOX FINALIZATION 01 — reply channel picker
  const { data: channelCtx } = useQuery({
    queryKey: ["reply-channel-ctx", conversationId],
    queryFn: () => getChannelCtx({ data: { conversationId } }),
  });
  const [channelOverride, setChannelOverride] = useState<string | null>(null);
  // Reset override when the conversation changes
  useEffect(() => setChannelOverride(null), [conversationId]);
  const activeChannelId = channelOverride ?? channelCtx?.defaultChannelId ?? null;
  const activeChannel = channelCtx?.channels.find((c) => c.id === activeChannelId) ?? null;

  const [qrOpen, setQrOpen] = useState(false);
  const [qrSearch, setQrSearch] = useState("");
  const [faPickerOpen, setFaPickerOpen] = useState(false);
  const [faTab, setFaTab] = useState<"flows" | "agents">("flows");



  const sendMut = useMutation({
    mutationFn: (input: Parameters<typeof send>[0]["data"]) => send({ data: input }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      const err = (res?.media_metadata as { send_error?: string } | null)?.send_error;
      if (err) {
        toast.warning(`Mensagem salva, mas o provedor retornou: ${err}`);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoresize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  useEffect(autoresize, [text, autoresize]);

  const handleSendText = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    const replyToId = replyingTo?.id;
    try {
      await sendMut.mutateAsync({
        conversationId,
        type: "text",
        body,
        replyToId,
        channelId: channelOverride ?? undefined,
      });
    } catch {
      // toast shown by sendMut
    } finally {
      onClearReply?.();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendText();
    }
    if (e.key === "/" && text === "") {
      setShowQR(true);
    }
    if (e.key === "Escape") setShowQR(false);
  };

  const applyQuickReply = (body: string) => {
    const replaced = body.replace(/\{\{nome\}\}/gi, contactName.split(" ")[0] ?? contactName);
    setText(replaced);
    setShowQR(false);
    textareaRef.current?.focus();
  };

  const uploadAndSend = async (file: File, type: "image" | "audio" | "file" | "video") => {
    const invalid = validateAttachment(file, type, ATTACHMENT_LIMITS.inbox);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      const up = await uploadAttachment({
        bucket: ATTACHMENT_BUCKETS.messageMedia,
        segments: [companyId, conversationId],
        file,
        kind: type,
        maxMb: ATTACHMENT_LIMITS.inbox,
      });
      const replyToId = replyingTo?.id;
      await sendMut.mutateAsync({
        conversationId,
        type,
        mediaUrl: up.path,
        mediaMetadata: { name: up.filename, size: up.size, mime: up.mimeType },
        replyToId,
        channelId: channelOverride ?? undefined,
      });
      onClearReply?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  };


  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "file" | "video" | "auto") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const resolved: "image" | "video" | "file" =
      type === "auto"
        ? file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
            ? "video"
            : "file"
        : type;
    void uploadAndSend(file, resolved);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : "file";
    void uploadAndSend(file, type);
  };

  const handleAudioSend = async (blob: Blob, durationSec: number) => {
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
    setShowRecorder(false);
    setUploading(true);
    try {
      const up = await uploadAttachment({
        bucket: ATTACHMENT_BUCKETS.messageMedia,
        segments: [companyId, conversationId],
        file,
        kind: "audio",
        maxMb: ATTACHMENT_LIMITS.inbox,
      });
      const replyToId = replyingTo?.id;
      await sendMut.mutateAsync({
        conversationId,
        type: "audio",
        mediaUrl: up.path,
        mediaMetadata: { duration: durationSec, mime: up.mimeType },
        replyToId,
        channelId: channelOverride ?? undefined,
      });
      onClearReply?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar áudio");
    } finally {
      setUploading(false);
    }
  };



  if (showRecorder) {
    return (
      <div className="composer-shell p-3">
        <AudioRecorder onSend={handleAudioSend} onCancel={() => setShowRecorder(false)} />
      </div>
    );
  }

  return (
    <div
      className={cn("composer-shell relative", dragOver && "ring-2 ring-primary/40")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[22px] border-2 border-dashed border-primary/50 bg-primary/5">
          <p className="text-sm font-medium text-primary">Solte para anexar</p>
        </div>
      )}

      {replyingTo && onClearReply && (
        <ReplyPreview message={replyingTo} contactName={contactName} onClear={onClearReply} />
      )}


      {showQR && quickReplies.length > 0 && (
        <div className="mx-2 mt-2 max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 shadow-md">
          {quickReplies.map((qr) => (
            <button
              key={qr.id}
              onClick={() => applyQuickReply(qr.body ?? "")}
              className="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-accent"
            >
              <span className="text-xs font-medium text-primary">{qr.shortcut}</span>
              <span className="text-sm">{qr.title}</span>
              <span className="truncate text-xs text-muted-foreground">{qr.body ?? ""}</span>
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        id="inbox-composer-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder={`Mensagem para ${contactName.split(" ")[0]}…  (/ para respostas rápidas)`}
        rows={1}
        className="block max-h-[140px] min-h-[44px] w-full resize-none bg-transparent px-5 pt-3.5 text-[14px] leading-[1.5] outline-none placeholder:text-muted-foreground/70"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 border-t border-border/40 px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <input
            ref={fileInputRef}
            type="file"
            accept={attachAccept}
            className="hidden"
            onChange={(e) => handleFile(e, "auto")}
          />

          <ToolbarBtn label="Emoji" onClick={() => {}}>
            <Smile className="h-4 w-4" />
          </ToolbarBtn>

          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Anexar"
                title="Anexar"
                disabled={uploading}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-52 p-1">
              <button
                type="button"
                onClick={() => {
                  setAttachAccept("image/*");
                  setAttachOpen(false);
                  requestAnimationFrame(() => fileInputRef.current?.click());
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
              >
                <ImageIcon className="h-4 w-4 text-primary" />
                <span>Imagem</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachAccept("video/*");
                  setAttachOpen(false);
                  requestAnimationFrame(() => fileInputRef.current?.click());
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
              >
                <Video className="h-4 w-4 text-primary" />
                <span>Vídeo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachAccept(
                    "application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar,.7z",
                  );
                  setAttachOpen(false);
                  requestAnimationFrame(() => fileInputRef.current?.click());
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
              >
                <FileText className="h-4 w-4 text-primary" />
                <span>Documento</span>
              </button>
            </PopoverContent>
          </Popover>

          <ToolbarBtn label="Áudio" onClick={() => setShowRecorder(true)} disabled={uploading}>
            <Mic className="h-4 w-4" />
          </ToolbarBtn>




          <Popover open={qrOpen} onOpenChange={setQrOpen}>
            <PopoverTrigger asChild>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Respostas rápidas"
                title="Respostas rápidas"
              >
                <Zap className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-2">
              <input
                autoFocus
                value={qrSearch}
                onChange={(e) => setQrSearch(e.target.value)}
                placeholder="Buscar por atalho ou título…"
                className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="max-h-64 overflow-y-auto">
                {quickReplies.length === 0 && (
                  <p className="p-3 text-center text-xs text-muted-foreground">Nenhuma resposta rápida cadastrada.</p>
                )}
                {quickReplies
                  .filter((qr) => {
                    const s = qrSearch.trim().toLowerCase();
                    if (!s) return true;
                    return (
                      qr.shortcut?.toLowerCase().includes(s) ||
                      qr.title?.toLowerCase().includes(s) ||
                      qr.body?.toLowerCase().includes(s)
                    );
                  })
                  .map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => {
                        applyQuickReply(qr.body ?? "");
                        setQrOpen(false);
                        setQrSearch("");
                      }}
                      className="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="text-xs font-medium text-primary">{qr.shortcut}</span>
                      <span className="text-sm">{qr.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{qr.body ?? ""}</span>
                    </button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>

          <FlowAgentPickerPopover
            open={faPickerOpen}
            onOpenChange={setFaPickerOpen}
            tab={faTab}
            onTabChange={setFaTab}
            conversationId={conversationId}
            companyId={companyId}
            trigger={
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Enviar Fluxo ou Agente IA"
                title="Enviar Fluxo ou Agente IA"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            }
          />


        </div>


        <div className="flex items-center gap-2">
          {/* INBOX FINALIZATION 01 — Channel picker */}
          {channelCtx && channelCtx.channels.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    channelOverride && "border-primary/50 bg-primary/10 text-primary",
                  )}
                  aria-label="Escolher canal de envio"
                  title="Canal de envio"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span className="max-w-[100px] truncate">
                    {activeChannel?.name ?? activeChannel?.phone_number ?? "Auto"}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-1">
                <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Canal de envio
                </p>
                {channelCtx.channels.map((ch) => {
                  const isDefault = ch.id === channelCtx.defaultChannelId;
                  const isSelected = ch.id === activeChannelId;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() =>
                        setChannelOverride(ch.id === channelCtx.defaultChannelId ? null : ch.id)
                      }
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full",
                          ch.status === "connected" ? "bg-emerald-500" : "bg-amber-500",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{ch.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {ch.phone_number ?? "sem número"}
                          {isDefault && " · padrão (última resposta)"}
                        </p>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
                {channelOverride && (
                  <button
                    type="button"
                    onClick={() => setChannelOverride(null)}
                    className="mt-1 w-full rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                  >
                    Voltar para padrão
                  </button>
                )}
              </PopoverContent>
            </Popover>
          )}

          <button
            onClick={handleSendText}
            disabled={!text.trim() || sendMut.isPending || uploading}
            aria-label="Enviar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:scale-[1.04] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {sendMut.isPending || uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 -translate-x-[1px] translate-y-[1px]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
