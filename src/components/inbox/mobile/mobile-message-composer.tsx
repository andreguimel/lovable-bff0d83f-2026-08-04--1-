import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Mic, Plus, Send, Sparkles, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  listActiveAgents,
  listActiveFlowsForCompany,
  listQuickReplies,
  runAgentOnConversation,
  runFlowOnConversation,
  sendMessage,
} from "@/lib/inbox.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_BUCKETS,
  ATTACHMENT_LIMITS,
  uploadAttachment,
  validateAttachment,
} from "@/lib/attachments";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AudioRecorder } from "../audio-recorder";
import { ReplyPreview, type ReplyPreviewMessage } from "../reply-preview";
import { MobileAttachmentSheet } from "./mobile-attachment-sheet";

interface Props {
  conversationId: string;
  contactName: string;
  companyId: string;
  replyingTo?: ReplyPreviewMessage | null;
  onClearReply?: () => void;
}

/**
 * Mobile message composer — fixed at the bottom, native-like.
 * Reuses the same server functions and AudioRecorder as the desktop composer.
 */
export function MobileMessageComposer({ conversationId, contactName, companyId, replyingTo, onClearReply }: Props) {
  const [text, setText] = useState("");
  const [showRecorder, setShowRecorder] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const send = useServerFn(sendMessage);
  const listQR = useServerFn(listQuickReplies);
  const runFlow = useServerFn(runFlowOnConversation);
  const runAgent = useServerFn(runAgentOnConversation);
  const listFlowsFn = useServerFn(listActiveFlowsForCompany);
  const listAgentsFn = useServerFn(listActiveAgents);

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

  const { data: quickReplies = [] } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => listQR(),
    enabled: qrOpen,
  });
  const { data: activeFlows = [] } = useQuery({
    queryKey: ["active-flows"],
    queryFn: () => listFlowsFn(),
    enabled: aiOpen,
  });
  const { data: activeAgents = [] } = useQuery({
    queryKey: ["active-agents"],
    queryFn: () => listAgentsFn(),
    enabled: aiOpen,
  });

  const runFlowMut = useMutation({
    mutationFn: async (flowId: string) => {
      const { data: authData } = await supabase.auth.getUser();
      const triggerId = crypto.randomUUID();
      console.info("[FLOW_RUNTIME_AUDIT] InboxExecuteFlowClicked", {
        workspace_id: companyId,
        organization_id: companyId,
        conversation_id: conversationId,
        flow_id: flowId,
        flow_version_id: null,
        trigger_id: triggerId,
        user_id: authData.user?.id ?? null,
      });
      return runFlow({ data: { conversationId, flowId, idempotencyKey: triggerId } });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(`Fluxo disparado (${r.messagesSent} mensagens)`);
      setAiOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const runAgentMut = useMutation({
    mutationFn: (agentId: string) => runAgent({ data: { conversationId, agentId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Agente respondeu");
      setAiOpen(false);
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
      await sendMut.mutateAsync({ conversationId, type: "text", body, replyToId });
    } catch {
      // toast handled by sendMut
    } finally {
      onClearReply?.();
    }
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
      });
      onClearReply?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "file" | "video") => {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadAndSend(file, type);
    e.target.value = "";
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
      });
      onClearReply?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar áudio");
    } finally {
      setUploading(false);
    }
  };


  const pickAttachment = (kind: "camera" | "gallery" | "video" | "file" | "audio") => {
    if (kind === "audio") return setShowRecorder(true);
    if (kind === "camera") return cameraInputRef.current?.click();
    if (kind === "gallery") return galleryInputRef.current?.click();
    if (kind === "video") return videoInputRef.current?.click();
    if (kind === "file") return fileInputRef.current?.click();
  };

  const applyQuickReply = (body: string) => {
    const replaced = body.replace(/\{\{nome\}\}/gi, contactName.split(" ")[0] ?? contactName);
    setText(replaced);
    setQrOpen(false);
    textareaRef.current?.focus();
  };

  if (showRecorder) {
    return (
      <div className="border-t border-border/40 bg-background px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <AudioRecorder onSend={handleAudioSend} onCancel={() => setShowRecorder(false)} />
      </div>
    );
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-border/40 bg-background px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
      {replyingTo && onClearReply && (
        <ReplyPreview message={replyingTo} contactName={contactName} onClear={onClearReply} className="mx-0 mb-2 mt-0" />
      )}
      {/* Hidden inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e, "image")} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e, "image")} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFile(e, "video")} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFile(e, "file")} />

      <div className="flex items-end gap-1.5">
        <button
          type="button"
          onClick={() => setAttachOpen(true)}
          aria-label="Anexar"
          disabled={uploading}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent disabled:opacity-40"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" />}
        </button>

        <div className="flex min-h-11 flex-1 items-end rounded-3xl border border-border/60 bg-muted/40 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            aria-label="Respostas rápidas"
            className="mb-1.5 mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent"
          >
            <Zap className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            id="inbox-composer-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Mensagem"
            rows={1}
            className="block max-h-[120px] min-h-[28px] w-full resize-none bg-transparent py-1.5 text-[15px] leading-[1.35] outline-none placeholder:text-muted-foreground/70"
            enterKeyHint="send"
          />
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            aria-label="IA / Fluxos"
            className="mb-1.5 ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-primary active:bg-accent"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </div>

        {hasText ? (
          <button
            type="button"
            onClick={() => void handleSendText()}
            disabled={sendMut.isPending || uploading}
            aria-label="Enviar"
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 disabled:opacity-40",
            )}
          >
            {sendMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 -translate-x-[1px]" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowRecorder(true)}
            aria-label="Gravar áudio"
            disabled={uploading}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 disabled:opacity-40"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}
      </div>

      <MobileAttachmentSheet open={attachOpen} onOpenChange={setAttachOpen} onPick={pickAttachment} />

      {/* Quick replies sheet */}
      <Sheet open={qrOpen} onOpenChange={setQrOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]">
          <SheetHeader>
            <SheetTitle>Respostas rápidas</SheetTitle>
          </SheetHeader>
          <div className="mt-3 max-h-[60vh] overflow-y-auto">
            {quickReplies.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma resposta rápida cadastrada.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {quickReplies.map((qr) => (
                  <li key={qr.id}>
                    <button
                      onClick={() => applyQuickReply(qr.body ?? "")}
                      className="flex w-full flex-col items-start gap-0.5 px-2 py-3 text-left active:bg-accent"
                    >
                      <span className="text-[11px] font-semibold text-primary">{qr.shortcut}</span>
                      <span className="text-[15px] font-medium">{qr.title}</span>
                      <span className="line-clamp-2 text-[13px] text-muted-foreground">{qr.body ?? ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* AI/Flows sheet */}
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]">
          <SheetHeader>
            <SheetTitle>Automação</SheetTitle>
          </SheetHeader>
          <Tabs defaultValue="agents" className="mt-3">
            <TabsList className="w-full">
              <TabsTrigger value="agents" className="flex-1">
                <Bot className="mr-1.5 h-4 w-4" /> Agentes IA
              </TabsTrigger>
              <TabsTrigger value="flows" className="flex-1">
                <Workflow className="mr-1.5 h-4 w-4" /> Fluxos
              </TabsTrigger>
            </TabsList>
            <TabsContent value="agents" className="mt-3 max-h-[50vh] overflow-y-auto">
              {activeAgents.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Nenhum agente ativo.</p>
              ) : (
                activeAgents.map((a) => (
                  <button
                    key={a.id}
                    disabled={runAgentMut.isPending}
                    onClick={() => runAgentMut.mutate(a.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-accent disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
                      <Bot className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{a.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{a.model}</p>
                    </div>
                    {runAgentMut.isPending && runAgentMut.variables === a.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </button>
                ))
              )}
            </TabsContent>
            <TabsContent value="flows" className="mt-3 max-h-[50vh] overflow-y-auto">
              {activeFlows.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Nenhum fluxo ativo.</p>
              ) : (
                activeFlows.map((f) => (
                  <button
                    key={f.id}
                    disabled={runFlowMut.isPending}
                    onClick={() => runFlowMut.mutate(f.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-accent disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
                      <Workflow className="h-5 w-5" />
                    </span>
                    <span className="flex-1 truncate text-[14px] font-medium">{f.name}</span>
                    {runFlowMut.isPending && runFlowMut.variables === f.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </button>
                ))
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
