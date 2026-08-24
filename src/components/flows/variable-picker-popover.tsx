import { useState } from "react";
import { Search, Code2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export type SystemVariable = {
  key: string;
  label: string;
  category: "system" | "custom" | "flow";
  description?: string;
};

export const SYSTEM_VARIABLES: SystemVariable[] = [
  // Campos do Sistema (Padrão WhatsApp / BotConversa)
  { key: "nome", label: "nome", category: "system", description: "Nome do contato (WhatsApp)" },
  { key: "primeiro-nome", label: "primeiro-nome", category: "system", description: "Primeiro nome do contato" },
  { key: "nome-completo", label: "nome-completo", category: "system", description: "Nome completo do contato" },
  { key: "sobrenome", label: "sobrenome", category: "system", description: "Sobrenome do contato" },
  { key: "telefone", label: "telefone", category: "system", description: "Número de telefone com DDD" },
  { key: "ddd", label: "ddd", category: "system", description: "Código DDD do telefone" },
  { key: "email", label: "email", category: "system", description: "E-mail do contato" },
  { key: "nome-indicador", label: "nome-indicador", category: "system", description: "Nome de quem indicou este contato" },
  { key: "numero-de-indicacoes", label: "numero-de-indicacoes", category: "system", description: "Total de indicações do contato" },
  { key: "codigo-indicacao", label: "codigo-indicacao", category: "system", description: "Código único de indicação" },
  { key: "canal", label: "canal", category: "system", description: "Nome do canal de atendimento" },
  { key: "empresa", label: "empresa", category: "system", description: "Nome da empresa/workspace" },
  { key: "atendente", label: "atendente", category: "system", description: "Nome do atendente responsável" },

  // Respostas & Fluxo
  { key: "reply", label: "reply (ou resposta)", category: "flow", description: "Resposta da pergunta anterior" },
  { key: "last_message", label: "last_message", category: "flow", description: "Última mensagem enviada pelo lead" },
  { key: "ai.output", label: "ai.output", category: "flow", description: "Resposta gerada pela IA" },
  { key: "http.body", label: "http.body", category: "flow", description: "Payload retornado por Webhook/HTTP" },
];

interface VariablePickerPopoverProps {
  onSelect: (variableTag: string) => void;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
}

export function VariablePickerPopover({
  onSelect,
  trigger,
  align = "end",
}: VariablePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = SYSTEM_VARIABLES.filter(
    (v) =>
      v.key.toLowerCase().includes(search.toLowerCase()) ||
      v.label.toLowerCase().includes(search.toLowerCase()) ||
      (v.description && v.description.toLowerCase().includes(search.toLowerCase())),
  );

  const systemFields = filtered.filter((v) => v.category === "system");
  const flowFields = filtered.filter((v) => v.category === "flow");

  const handlePick = (key: string) => {
    onSelect(`{{${key}}}`);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs font-mono gap-1 text-primary border-primary/30 hover:bg-primary/10"
            title="Inserir campo do sistema / variável"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>{"{}"}</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-72 p-0 shadow-lg border border-border/80 rounded-xl overflow-hidden"
      >
        <div className="p-2 border-b border-border/60 bg-muted/30 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search field..."
            className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            autoFocus
          />
        </div>

        <ScrollArea className="h-64 p-2">
          {systemFields.length > 0 && (
            <div className="space-y-1 mb-3">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 py-1">
                Campos do Sistema
              </p>
              {systemFields.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handlePick(item.key)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground text-xs flex flex-col transition-colors group"
                >
                  <span className="font-mono text-foreground font-medium group-hover:text-primary">
                    {item.key}
                  </span>
                  {item.description && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {item.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {flowFields.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 py-1">
                Fluxo & Respostas
              </p>
              {flowFields.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handlePick(item.key)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground text-xs flex flex-col transition-colors group"
                >
                  <span className="font-mono text-foreground font-medium group-hover:text-primary">
                    {item.key}
                  </span>
                  {item.description && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {item.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Nenhum campo encontrado para "{search}"
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
