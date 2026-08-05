import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Paperclip, Sparkles, Send, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { draftEmailFromConversation, sendLeadEmail } from "@/lib/email-ai.functions";
import { EmailAttachmentList, type Attachment } from "./email-attachment-list";

const ACCEPT =
  ".pdf,.xls,.xlsx,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt,.zip,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/gif,image/webp,text/plain,application/zip";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactEmail: string;
  contactName: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function EmailAiDialog({ open, onOpenChange, conversationId, contactEmail, contactName }: Props) {
  const draftFn = useServerFn(draftEmailFromConversation);
  const sendFn = useServerFn(sendLeadEmail);

  const [to, setTo] = useState(contactEmail);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [showInstruction, setShowInstruction] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  const draftMut = useMutation({
    mutationFn: (vars: { instruction?: string; useDraft?: boolean }) =>
      draftFn({
        data: {
          conversationId,
          instruction: vars.instruction,
          currentDraft: vars.useDraft ? { subject, body } : undefined,
        },
      }),
    onSuccess: (res) => {
      setSubject(res.subject);
      setBody(res.body);
      setInstruction("");
      setShowInstruction(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const atts = attachments.map((a) => ({
        filename: a.file.name,
        contentType: a.file.type || "application/octet-stream",
        base64: a.base64,
      }));
      return sendFn({ data: { conversationId, to, subject, body, attachments: atts } });
    },
    onSuccess: () => {
      toast.success("E-mail enviado com sucesso");
      onOpenChange(false);
      resetState();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetState() {
    setSubject("");
    setBody("");
    setInstruction("");
    setAttachments([]);
    setShowInstruction(false);
    initialized.current = false;
  }

  // Ao abrir: gera rascunho inicial
  useEffect(() => {
    if (open && !initialized.current) {
      initialized.current = true;
      setTo(contactEmail);
      draftMut.mutate({});
    }
    if (!open) resetState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onPickFiles(list: FileList | null) {
    if (!list) return;
    const next: Attachment[] = [];
    for (const file of Array.from(list)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" ultrapassa 10 MB.`);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        next.push({ id: crypto.randomUUID(), file, base64 });
      } catch {
        toast.error(`Falha ao ler "${file.name}".`);
      }
    }
    setAttachments((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  const isInitialLoading = draftMut.isPending && !subject && !body;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            E-mail com IA para {contactName}
          </DialogTitle>
          <DialogDescription>
            A IA leu a conversa e preparou um rascunho. Ajuste manualmente ou peça uma revisão à IA antes de enviar.
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              IA está lendo a conversa…
            </div>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mail-to">Para</Label>
              <Input id="mail-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mail-subject">Assunto</Label>
              <Input
                id="mail-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mail-body">Corpo</Label>
              <Textarea
                id="mail-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            {showInstruction ? (
              <div className="grid gap-1.5 rounded-md border border-dashed border-border/60 p-3">
                <Label htmlFor="mail-inst" className="text-xs">
                  Peça um ajuste à IA
                </Label>
                <Textarea
                  id="mail-inst"
                  placeholder='Ex: "deixe mais formal", "encurte para 2 parágrafos", "adicione o preço de R$ 200"'
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowInstruction(false);
                      setInstruction("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!instruction.trim() || draftMut.isPending}
                    onClick={() =>
                      draftMut.mutate({ instruction: instruction.trim(), useDraft: true })
                    }
                  >
                    {draftMut.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="mr-2 h-3.5 w-3.5" />
                    )}
                    Regerar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowInstruction(true)}
                className="w-fit"
              >
                <Wand2 className="mr-2 h-3.5 w-3.5" />
                Pedir ajuste à IA
              </Button>
            )}

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Anexos</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="mr-2 h-3.5 w-3.5" />
                  Adicionar arquivo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
              </div>
              <EmailAttachmentList
                attachments={attachments}
                onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              />
              {attachments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  PDF, Excel, Word, imagens, TXT ou ZIP — até 10 MB por arquivo.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sendMut.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => sendMut.mutate()}
            disabled={
              sendMut.isPending || isInitialLoading || !to || !subject.trim() || !body.trim()
            }
          >
            {sendMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar e-mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
