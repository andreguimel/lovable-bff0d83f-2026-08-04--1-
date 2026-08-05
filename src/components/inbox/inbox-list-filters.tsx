import { Filter, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type InboxSort = "recent" | "oldest" | "unread";
export type InboxStatus = "all" | "open" | "pending" | "resolved";
export type InboxScope = "all" | "mine" | "unassigned";

export type ChannelOption = { id: string; name: string };

type Props = {
  sort: InboxSort;
  onSortChange: (v: InboxSort) => void;
  status: InboxStatus;
  onStatusChange: (v: InboxStatus) => void;
  scope: InboxScope;
  onScopeChange: (v: InboxScope) => void;
  channelId: string | "all";
  onChannelChange: (v: string | "all") => void;
  channels: ChannelOption[];
  activeCount: number;
  onReset: () => void;
};

const sortOptions: Array<{ label: string; value: InboxSort }> = [
  { label: "Mais recentes", value: "recent" },
  { label: "Mais antigas", value: "oldest" },
  { label: "Não lidas primeiro", value: "unread" },
];

const statusOptions: Array<{ label: string; value: InboxStatus }> = [
  { label: "Todas", value: "all" },
  { label: "Abertas", value: "open" },
  { label: "Pendentes", value: "pending" },
  { label: "Resolvidas", value: "resolved" },
];

const scopeOptions: Array<{ label: string; value: InboxScope }> = [
  { label: "Todos", value: "all" },
  { label: "Minhas", value: "mine" },
  { label: "Sem responsável", value: "unassigned" },
];

function Row({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  );
}

export function InboxListFilters({
  sort,
  onSortChange,
  status,
  onStatusChange,
  scope,
  onScopeChange,
  channelId,
  onChannelChange,
  channels,
  activeCount,
  onReset,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 rounded-lg"
          aria-label="Filtros avançados"
        >
          <Filter className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-60 overflow-y-auto p-2">
        <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ordenar por
        </p>
        {sortOptions.map((o) => (
          <Row key={o.value} label={o.label} selected={sort === o.value} onSelect={() => onSortChange(o.value)} />
        ))}

        <Separator className="my-2" />
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </p>
        {statusOptions.map((o) => (
          <Row key={o.value} label={o.label} selected={status === o.value} onSelect={() => onStatusChange(o.value)} />
        ))}

        <Separator className="my-2" />
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Responsável
        </p>
        {scopeOptions.map((o) => (
          <Row key={o.value} label={o.label} selected={scope === o.value} onSelect={() => onScopeChange(o.value)} />
        ))}

        <Separator className="my-2" />
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Instância / canal
        </p>
        <div className="max-h-40 overflow-y-auto">
          <Row label="Todos os canais" selected={channelId === "all"} onSelect={() => onChannelChange("all")} />
          {channels.map((c) => (
            <Row
              key={c.id}
              label={c.name}
              selected={channelId === c.id}
              onSelect={() => onChannelChange(c.id)}
            />
          ))}
        </div>

        {activeCount > 0 && (
          <>
            <Separator className="my-2" />
            <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={onReset}>
              Limpar filtros
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ConversationListSkeleton() {
  return (
    <ul className="space-y-1 px-1" aria-busy="true" aria-label="Carregando conversas">
      {Array.from({ length: 7 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}
