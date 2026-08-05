import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  tags: TagOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function TagsMultiSelect({ tags, selectedIds, onChange, placeholder = "Selecionar tags" }: Props) {
  const [open, setOpen] = useState(false);
  const selected = tags.filter((t) => selectedIds.includes(t.id));
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" className="min-h-9 h-auto justify-between gap-2 py-1.5">
          <span className="flex flex-wrap items-center gap-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((t) => (
                <Badge
                  key={t.id}
                  variant="secondary"
                  className="border-0"
                  style={{ backgroundColor: t.color + "22", color: t.color }}
                >
                  {t.name}
                </Badge>
              ))
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar tag…" />
          <CommandList>
            <CommandEmpty>Nenhuma tag</CommandEmpty>
            <CommandGroup>
              {tags.map((t) => {
                const checked = selectedIds.includes(t.id);
                return (
                  <CommandItem key={t.id} onSelect={() => toggle(t.id)} className="gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="flex-1">{t.name}</span>
                    <Check className={cn("h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
