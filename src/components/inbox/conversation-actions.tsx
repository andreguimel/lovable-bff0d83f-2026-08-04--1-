import {
  forwardRef,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  CheckCheck,
  Copy,
  Forward,
  Info,
  Mail,
  MoreVertical,
  Pencil,
  Reply,
  Smile,
  Star,
  StarOff,
  SquareCheckBig,
  Trash2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteConversation,
  markAsRead,
  markConversationAsUnread,
  updateConversation,
  toggleConversationArchive,
  toggleConversationMute,
  toggleConversationPin,
} from "@/lib/inbox.functions";
import { cn } from "@/lib/utils";

export type ConversationActionsConversation = {
  id: string;
  status: "open" | "pending" | "resolved";
  pinned: boolean;
  unread_count: number;
  last_message_preview?: string | null;
  contact?: {
    name?: string | null;
    phone?: string | null;
  } | null;
};

type ConversationCommand = "pin" | "read" | "unread" | "resolve" | "reopen" | "archive" | "mute";

interface ConversationActionsProps {
  conversation: ConversationActionsConversation;
  children: ReactNode;
  triggerClassName?: string;
  trigger?: ReactNode;
}

export function ConversationActions({
  conversation,
  children,
  triggerClassName,
  trigger,
}: ConversationActionsProps) {
  const qc = useQueryClient();
  const update = useServerFn(updateConversation);
  const markRead = useServerFn(markAsRead);
  const markUnread = useServerFn(markConversationAsUnread);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const removeConversation = useServerFn(deleteConversation);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const deleteMut = useMutation({
    mutationFn: async () => {
      await removeConversation({ data: { conversationId: conversation.id } });
    },
    onSuccess: async () => {
      setConfirmDeleteOpen(false);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.removeQueries({ queryKey: ["conversation", conversation.id] });
      toast.success("Conversa excluída");
      if (routerState.location.pathname.includes(conversation.id)) {
        await navigate({ to: "/inbox" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  });

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["conversations"] }),
      qc.invalidateQueries({ queryKey: ["conversation", conversation.id] }),
    ]);
  };

  const commandMut = useMutation({
    mutationFn: async (command: ConversationCommand) => {
      if (command === "pin") {
        await update({ data: { id: conversation.id, pinned: !conversation.pinned } });
        return conversation.pinned ? "Conversa removida dos estrelados" : "Conversa estrelada";
      }
      if (command === "read") {
        await markRead({ data: { conversationId: conversation.id } });
        return "Conversa marcada como lida";
      }
      if (command === "unread") {
        await markUnread({ data: { conversationId: conversation.id } });
        return "Conversa marcada como não lida";
      }
      if (command === "resolve") {
        await update({ data: { id: conversation.id, status: "resolved" } });
        return "Conversa resolvida";
      }
      if (command === "archive") {
        await toggleConversationArchive({ data: { conversationId: conversation.id } });
        return "Conversa arquivada";
      }
      if (command === "mute") {
        await toggleConversationMute({ data: { conversationId: conversation.id, minutes: 480 } });
        return "Conversa silenciada por 8h";
      }
      await update({ data: { id: conversation.id, status: "open" } });
      return "Conversa reaberta";
    },
    onSuccess: async (message) => {
      await invalidate();
      toast.success(message);
      setDropdownOpen(false);
      setSheetOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyContact = async () => {
    const text = conversation.contact?.phone ?? conversation.contact?.name ?? conversation.last_message_preview ?? "";
    if (!text) {
      toast.error("Não há dados para copiar");
      return;
    }
    try {
      await copyText(text);
      toast.success(conversation.contact?.phone ? "Telefone copiado" : "Texto copiado");
    } catch {
      toast.error("Não foi possível copiar");
    } finally {
      setDropdownOpen(false);
      setSheetOpen(false);
    }
  };

  const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to the textarea fallback below. Some embedded browsers
        // deny Clipboard API writes even for user-triggered menu actions.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) throw new Error("Clipboard unavailable");
  };

  const startLongPress = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    longPressRef.current.fired = false;
    if (longPressRef.current.timer) clearTimeout(longPressRef.current.timer);
    longPressRef.current.timer = setTimeout(() => {
      longPressRef.current.fired = true;
      setSheetOpen(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          (navigator as Navigator & { vibrate?: (pattern: number) => boolean }).vibrate?.(12);
        } catch {
          // best effort only
        }
      }
    }, 420);
  };

  const cancelLongPress = () => {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  };

  const preventClickAfterLongPress = (event: MouseEvent<HTMLDivElement>) => {
    if (!longPressRef.current.fired) return;
    event.preventDefault();
    event.stopPropagation();
    longPressRef.current.fired = false;
  };

  const menuItems = (kind: "dropdown" | "context") => {
    const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
    const Separator = kind === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
    const isUnread = conversation.unread_count > 0;
    const disabled = commandMut.isPending;

    return (
      <>
        <Item disabled={disabled} onSelect={(event) => { event.preventDefault(); void copyContact(); }}>
          <Copy className="mr-2 h-4 w-4" />
          {conversation.contact?.phone ? "Copiar telefone" : "Copiar texto"}
        </Item>
        <Item disabled={disabled} onSelect={() => commandMut.mutate("pin")}>
          {conversation.pinned ? <StarOff className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />}
          {conversation.pinned ? "Remover dos estrelados" : "Estrelar conversa"}
        </Item>
        <Item disabled={disabled} onSelect={() => commandMut.mutate(isUnread ? "read" : "unread")}>
          {isUnread ? <CheckCheck className="mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />}
          {isUnread ? "Marcar como lida" : "Marcar como não lida"}
        </Item>
        <Item disabled={disabled} onSelect={() => commandMut.mutate("archive")}>
          <Archive className="mr-2 h-4 w-4" />
          Arquivar conversa
        </Item>
        <Item disabled={disabled} onSelect={() => commandMut.mutate("mute")}>
          <VolumeX className="mr-2 h-4 w-4" />
          Silenciar (8h)
        </Item>
        <Separator />
        <Item
          disabled={disabled}
          onSelect={() => commandMut.mutate(conversation.status === "resolved" ? "reopen" : "resolve")}
        >
          <CheckCheck className="mr-2 h-4 w-4" />
          {conversation.status === "resolved" ? "Reabrir conversa" : "Resolver conversa"}
        </Item>
        <Separator />
        <Item
          disabled={disabled || deleteMut.isPending}
          className="text-destructive focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();
            setDropdownOpen(false);
            setSheetOpen(false);
            setConfirmDeleteOpen(true);
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir conversa
        </Item>
      </>
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group relative"
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerMove={cancelLongPress}
          onClickCapture={preventClickAfterLongPress}
        >
          {children}
          <div className={cn("absolute right-2 top-1/2 z-10 -translate-y-1/2", triggerClassName)}>
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                {trigger ?? <ConversationMenuButton open={dropdownOpen} />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {menuItems("dropdown")}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-72">{menuItems("context")}</ContextMenuContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b border-border/40 px-5 py-3 text-left">
            <SheetTitle className="text-[15px] font-semibold">Ações da conversa</SheetTitle>
          </SheetHeader>
          <ConversationSheetActions
            conversation={conversation}
            pending={commandMut.isPending}
            onCopy={() => void copyContact()}
            onCommand={(command) => commandMut.mutate(command)}
            onDelete={() => {
              setSheetOpen(false);
              setConfirmDeleteOpen(true);
            }}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa com {conversation.contact?.name ?? conversation.contact?.phone ?? "este contato"} sai
              do Inbox. O histórico fica guardado para auditoria e uma nova mensagem do contato abre uma
              conversa nova.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteMut.mutate();
              }}
            >
              {deleteMut.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  );
}

export const ConversationMenuButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { open?: boolean }
>(({ open, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label="Menu da conversa"
    className={cn(
      "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
      open && "bg-accent text-foreground opacity-100",
      className,
    )}
    {...props}
  >
    <MoreVertical className="h-4 w-4" />
  </button>
));
ConversationMenuButton.displayName = "ConversationMenuButton";

function ConversationSheetActions({
  conversation,
  pending,
  onCopy,
  onCommand,
  onDelete,
}: {
  conversation: ConversationActionsConversation;
  pending: boolean;
  onCopy: () => void;
  onCommand: (command: ConversationCommand) => void;
  onDelete: () => void;
}) {
  const isUnread = conversation.unread_count > 0;

  return (
    <div className="flex flex-col py-1">
      <SheetAction icon={<Copy className="h-5 w-5" />} label={conversation.contact?.phone ? "Copiar telefone" : "Copiar texto"} disabled={pending} onClick={onCopy} />
      <SheetAction
        icon={conversation.pinned ? <StarOff className="h-5 w-5" /> : <Star className="h-5 w-5" />}
        label={conversation.pinned ? "Remover dos estrelados" : "Estrelar conversa"}
        disabled={pending}
        onClick={() => onCommand("pin")}
      />
      <SheetAction
        icon={isUnread ? <CheckCheck className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
        label={isUnread ? "Marcar como lida" : "Marcar como não lida"}
        disabled={pending}
        onClick={() => onCommand(isUnread ? "read" : "unread")}
      />
      <div className="my-1 h-px bg-border/50" />
      <SheetAction
        icon={<CheckCheck className="h-5 w-5" />}
        label={conversation.status === "resolved" ? "Reabrir conversa" : "Resolver conversa"}
        disabled={pending}
        onClick={() => onCommand(conversation.status === "resolved" ? "reopen" : "resolve")}
      />
      <div className="my-1 h-px bg-border/50" />
      <SheetAction icon={<Reply className="h-5 w-5" />} label="Responder" hint="indisponível" disabled />
      <SheetAction icon={<Smile className="h-5 w-5" />} label="Reagir" hint="indisponível" disabled />
      <SheetAction icon={<Star className="h-5 w-5" />} label="Favoritar" hint="indisponível" disabled />
      <SheetAction icon={<Forward className="h-5 w-5" />} label="Encaminhar" hint="indisponível" disabled />
      <SheetAction icon={<SquareCheckBig className="h-5 w-5" />} label="Selecionar mensagens" hint="indisponível" disabled />
      <SheetAction icon={<Archive className="h-5 w-5" />} label="Arquivar" hint="indisponível" disabled />
      <SheetAction icon={<VolumeX className="h-5 w-5" />} label="Silenciar conversa" hint="indisponível" disabled />
      <div className="my-1 h-px bg-border/50" />
      <SheetAction
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        label="Excluir conversa"
        disabled={pending}
        onClick={onDelete}
      />
    </div>
  );
}

function SheetAction({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[52px] w-full items-center gap-4 px-5 text-left text-[15px] transition-colors active:bg-accent/70",
        disabled && "opacity-50",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate leading-tight">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

function UnavailableItem({
  Item,
  icon,
  label,
  reason,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
  icon: ReactNode;
  label: string;
  reason: string;
}) {
  return (
    <Item disabled title={reason} className="opacity-45">
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">indisp.</span>
    </Item>
  );
}