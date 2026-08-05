import { useState } from "react";
import { ArrowRightLeft, Bot, Mail, Phone, Radio, Sparkles, User as UserIcon, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactTimeline } from "@/components/crm/contact-timeline";
import { cn } from "@/lib/utils";
import { EmailAiDialog } from "../email-ai-dialog";
import { TransferDialog } from "../transfer-dialog";

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  avatar_url: string | null;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact;
  tags: Tag[];
  channelName?: string;
  conversationId: string;
  assigneeLabel: string;
  assigneeType: "unassigned" | "agent_user" | "ai_agent";
  status: "open" | "pending" | "resolved";
}

/**
 * Mobile bottom sheet with contact details, tags, CRM timeline, and quick
 * actions. Wraps existing EmailAiDialog / TransferDialog to reuse logic.
 */
export function MobileContactSheet({
  open,
  onOpenChange,
  contact,
  tags,
  channelName,
  conversationId,
  assigneeLabel,
  assigneeType,
  status,
}: Props) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92dvh] rounded-t-3xl p-0">
          <div className="flex max-h-[92dvh] flex-col">
            <SheetHeader className="shrink-0 border-b border-border/50 px-5 pb-3 pt-4">
              <SheetTitle className="sr-only">Detalhes do contato</SheetTitle>
              <div className="flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-lg font-semibold text-primary-foreground ring-1 ring-border/40">
                  {contact.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[16px] font-semibold text-foreground">{contact.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status === "open" ? "bg-success" : status === "pending" ? "bg-warning" : "bg-muted-foreground",
                      )}
                    />
                    {status === "open" ? "Aberta" : status === "pending" ? "Pendente" : "Resolvida"}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-4 mt-3 grid h-10 grid-cols-2 rounded-full bg-muted/60 p-1">
                <TabsTrigger value="overview" className="rounded-full text-xs">Visão geral</TabsTrigger>
                <TabsTrigger value="history" className="rounded-full text-xs">Histórico</TabsTrigger>
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto momentum-scroll">
                <TabsContent value="overview" className="mt-0 space-y-4 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
                  <section className="rounded-2xl border border-border/50 bg-card p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contato</p>
                    <InfoRow icon={Phone} label="Telefone" value={contact.phone ?? "—"} />
                    <InfoRow icon={Mail} label="Email" value={contact.email ?? "—"} />
                    {channelName && <InfoRow icon={Radio} label="Canal" value={channelName} />}
                  </section>

                  <section className="rounded-2xl border border-border/50 bg-card p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Atendimento</p>
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "grid h-9 w-9 place-items-center rounded-full",
                          assigneeType === "ai_agent"
                            ? "bg-primary/15 text-primary"
                            : assigneeType === "agent_user"
                              ? "bg-success/15 text-success"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {assigneeType === "ai_agent" ? <Bot className="h-4 w-4" /> : assigneeType === "agent_user" ? <UserIcon className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {assigneeType === "ai_agent" ? "Agente IA" : assigneeType === "agent_user" ? "Atendente" : "Sem responsável"}
                        </p>
                        <p className="truncate text-[14px] font-semibold text-foreground">{assigneeLabel}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/50 bg-card p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Etiquetas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.length === 0 ? (
                        <p className="text-[12px] text-muted-foreground">Sem etiquetas.</p>
                      ) : (
                        tags.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                            style={{
                              backgroundColor: `color-mix(in oklab, ${t.color} 14%, transparent)`,
                              color: t.color,
                              border: `1px solid color-mix(in oklab, ${t.color} 35%, transparent)`,
                            }}
                          >
                            {t.name}
                          </span>
                        ))
                      )}
                    </div>
                  </section>

                  {contact.notes && (
                    <section className="rounded-2xl border border-border/50 bg-card p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notas internas</p>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{contact.notes}</p>
                    </section>
                  )}

                  <div className="grid gap-2 pt-1">
                    <Button
                      variant="outline"
                      disabled={!contact.email}
                      onClick={() => setEmailOpen(true)}
                      className="h-11 w-full justify-start gap-2 rounded-xl text-[14px]"
                    >
                      <Sparkles className="h-4 w-4 text-primary" /> Compor e-mail com IA
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setTransferOpen(true)}
                      className="h-11 w-full justify-start gap-2 rounded-xl text-[14px]"
                    >
                      <ArrowRightLeft className="h-4 w-4" /> Transferir para outro número
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
                  <ContactTimeline contactId={contact.id} />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {contact.email && (
        <EmailAiDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          conversationId={conversationId}
          contactEmail={contact.email}
          contactName={contact.name}
        />
      )}
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        conversationId={conversationId}
        currentChannelName={channelName}
      />
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-[13.5px] font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
