import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCustomFields, createCustomField, deleteCustomField } from "@/lib/crm.functions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type FieldType = "text" | "number" | "date" | "select";

export function CustomFieldsManager({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const listCF = useServerFn(listCustomFields);
  const createCF = useServerFn(createCustomField);
  const deleteCF = useServerFn(deleteCustomField);

  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");

  const { data: fields = [] } = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => listCF(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      createCF({
        data: {
          label,
          field_type: type,
          options:
            type === "select"
              ? optionsText.split(",").map((s) => s.trim()).filter(Boolean)
              : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Campo criado");
      setLabel("");
      setOptionsText("");
      qc.invalidateQueries({ queryKey: ["custom-fields"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteCF({ data: { id } }),
    onSuccess: () => {
      toast.success("Campo removido");
      qc.invalidateQueries({ queryKey: ["custom-fields"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Campos customizados</DialogTitle>
          <DialogDescription>
            Adicione campos personalizados aos seus contatos (ex: data de nascimento, cargo, CNPJ).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            {fields.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum campo ainda.</p>
            ) : (
              fields.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.label}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {f.field_type}
                      </Badge>
                      {Array.isArray(f.options) && (
                        <span className="truncate">{(f.options as string[]).join(", ")}</span>
                      )}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(f.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="grid gap-3 rounded-lg border border-dashed border-border p-3">
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="cf-label">Nome do campo</Label>
                <Input id="cf-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: CNPJ" />
              </div>
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                    <SelectItem value="select">Lista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {type === "select" && (
              <div className="grid gap-1.5">
                <Label htmlFor="cf-opt">Opções (separadas por vírgula)</Label>
                <Input
                  id="cf-opt"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="Pequeno, Médio, Grande"
                />
              </div>
            )}
            <Button onClick={() => create.mutate()} disabled={!label.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Adicionar campo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
