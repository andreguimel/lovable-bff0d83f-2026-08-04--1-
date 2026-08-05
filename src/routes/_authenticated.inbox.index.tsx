import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inbox/")({
  component: EmptyInbox,
});

function EmptyInbox() {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-background">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-primary text-primary-foreground shadow-md ring-1 ring-border/40">
            <MessagesSquare className="h-8 w-8" />
          </div>
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-success ring-4 ring-background" />
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-foreground">
            Selecione uma conversa
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Escolha uma conversa na lista à esquerda para começar a atender.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <Kbd>↑ ↓</Kbd>
          <span className="text-[11px] text-muted-foreground">navegar</span>
          <span className="text-muted-foreground/40">·</span>
          <Kbd>Enter</Kbd>
          <span className="text-[11px] text-muted-foreground">abrir</span>
          <span className="text-muted-foreground/40">·</span>
          <Kbd>⌘K</Kbd>
          <span className="text-[11px] text-muted-foreground">buscar</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border/60 bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
