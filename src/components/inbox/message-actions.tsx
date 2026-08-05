/**
 * Inbox message actions — Fase 3 (Desktop only).
 *
 * - Right-click on a message → context menu (WhatsApp Web-like).
 * - Hover reveals `...` button which opens the same menu.
 * - "Copiar" copies the message body to the clipboard.
 * - "Selecionar" enters multi-select mode.
 * - "Excluir para mim" / "Excluir para todos" / "Excluir do inbox"
 *   respect provider capabilities (loaded via
 *   getConversationDeleteCapabilities).
 */
import { useState, type ReactNode } from "react";
import { MoreVertical, CheckSquare, Copy, Reply, Trash2, Forward, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import type { DeleteCapabilities } from "@/lib/message-delete.functions";

export type DeleteAction = "inbox_only" | "for_me" | "for_everyone";

export interface MessageActionsProps {
  children: ReactNode;
  /** Message is outbound (from the company) — required for `for_everyone`. */
  outbound: boolean;
  /** Already soft-deleted → suppress actions. */
  deleted: boolean;
  /** Raw message body — used by "Copiar". Null/empty disables the item. */
  body?: string | null;
  /** Provider capabilities for the current conversation. Nullable while loading. */
  capabilities: DeleteCapabilities | null;
  /** User has the base inbox.delete permission. */
  canDelete: boolean;
  /** Reply to this message. Opens the composer with a quoted preview. */
  onReply?: () => void;
  /** Open the forward dialog for this single message. */
  onForward?: () => void;
  /** Open the "Message info" side/bottom sheet for this single message. */
  onInfo?: () => void;

  /** Enter multi-select mode with this message pre-selected. */
  onEnterSelect: () => void;
  /** Trigger the delete confirmation dialog for this single message with scope. */
  onDelete: (scope: DeleteAction) => void;
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea fallback. Embedded browsers sometimes
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
}

export function MessageActions({
  children,
  outbound,
  deleted,
  body,
  capabilities,
  canDelete,
  onReply,
  onForward,
  onInfo,
  onEnterSelect,

  onDelete,
}: MessageActionsProps) {
  const [hover, setHover] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Deleted messages: no actions (tombstone rendered by parent).
  if (deleted) return <>{children}</>;

  const canForEveryone =
    canDelete && outbound && (capabilities?.supportsForEveryone ?? false);
  const canForMe = canDelete && (capabilities?.supportsForMe ?? true);
  const canInboxOnly = canDelete;
  const trimmed = (body ?? "").trim();
  const canCopy = trimmed.length > 0;

  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await copyToClipboard(trimmed);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const menu = (
    <>
      {onReply && (
        <ContextMenuItem onSelect={() => onReply()}>
          <Reply className="mr-2 h-3.5 w-3.5" />
          Responder
        </ContextMenuItem>
      )}
      <ContextMenuItem
        disabled={!canCopy}
        onSelect={(event) => {
          event.preventDefault();
          void handleCopy();
        }}
      >
        <Copy className="mr-2 h-3.5 w-3.5" />
        Copiar
      </ContextMenuItem>
      {onForward && (
        <ContextMenuItem onSelect={() => onForward()}>
          <Forward className="mr-2 h-3.5 w-3.5" />
          Encaminhar
        </ContextMenuItem>
      )}
      {onInfo && (
        <ContextMenuItem onSelect={() => onInfo()}>
          <Info className="mr-2 h-3.5 w-3.5" />
          Informações da mensagem
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => onEnterSelect()}>
        <CheckSquare className="mr-2 h-3.5 w-3.5" />
        Selecionar mensagem
      </ContextMenuItem>

      {canDelete && (
        <>
          <ContextMenuSeparator />
          {canForMe && (
            <ContextMenuItem onSelect={() => onDelete("for_me")}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Excluir para mim
              {capabilities?.reasonForMe && (
                <span className="ml-1 text-[10px] text-muted-foreground">(local)</span>
              )}
            </ContextMenuItem>
          )}
          <ContextMenuItem
            disabled={!canForEveryone}
            onSelect={() => canForEveryone && onDelete("for_everyone")}
            title={
              !canForEveryone
                ? outbound
                  ? capabilities?.reasonForEveryone ?? "Provedor não suporta revoke."
                  : "Só mensagens enviadas por você podem ser removidas para todos."
                : undefined
            }
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Excluir para todos
          </ContextMenuItem>
          {canInboxOnly && (
            <ContextMenuItem
              onSelect={() => onDelete("inbox_only")}
              className="text-muted-foreground"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Remover apenas do inbox
            </ContextMenuItem>
          )}
        </>
      )}
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="relative"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {children}
          {(hover || dropdownOpen) && (
            <div
              className={cn(
                "absolute top-1 z-10 opacity-90 transition-opacity",
                outbound ? "-left-7" : "-right-7",
              )}
            >
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Ações da mensagem"
                    className="grid h-6 w-6 place-items-center rounded-full bg-background/90 text-muted-foreground shadow ring-1 ring-border/40 hover:text-foreground"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={outbound ? "start" : "end"}
                  className="min-w-[180px]"
                >
                  {onReply && (
                    <DropdownMenuItem onSelect={() => onReply()}>
                      <Reply className="mr-2 h-3.5 w-3.5" />
                      Responder
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={!canCopy}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleCopy();
                    }}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copiar
                  </DropdownMenuItem>
                  {onForward && (
                    <DropdownMenuItem onSelect={() => onForward()}>
                      <Forward className="mr-2 h-3.5 w-3.5" />
                      Encaminhar
                    </DropdownMenuItem>
                  )}
                  {onInfo && (
                    <DropdownMenuItem onSelect={() => onInfo()}>
                      <Info className="mr-2 h-3.5 w-3.5" />
                      Informações da mensagem
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => onEnterSelect()}>
                    <CheckSquare className="mr-2 h-3.5 w-3.5" />
                    Selecionar mensagem
                  </DropdownMenuItem>

                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      {canForMe && (
                        <DropdownMenuItem onSelect={() => onDelete("for_me")}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Excluir para mim
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        disabled={!canForEveryone}
                        onSelect={() => canForEveryone && onDelete("for_everyone")}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Excluir para todos
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onDelete("inbox_only")}
                        className="text-muted-foreground"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Remover apenas do inbox
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]">{menu}</ContextMenuContent>
    </ContextMenu>
  );
}
