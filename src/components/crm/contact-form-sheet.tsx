import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagsMultiSelect } from "./tags-multiselect";
import { createContact, listCustomFields } from "@/lib/crm.functions";
import { listTags } from "@/lib/inbox.functions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (id: string) => void;
}

export function ContactFormSheet({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const listAllTags = useServerFn(listTags);
  const listCF = useServerFn(listCustomFields);
  const create = useServerFn(createContact);

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => listAllTags(), enabled: open });
  const { data: fields = [] } = useQuery({ queryKey: ["custom-fields"], queryFn: () => listCF(), enabled: open });

  useEffect(() => {
    if (!open) {
      setName("");
      setPhone("");
      setEmail("");
      setNotes("");
      setTagIds([]);
      setCustomFields({});
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          phone,
          email: email || undefined,
          notes: notes || undefined,
          tagIds,
          customFields,
        },
      }),
    onSuccess: (r) => {
      toast.success("Contato criado");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      onCreated?.(r.id);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Novo contato</SheetTitle>
          <SheetDescription>Adicione um novo contato ao seu CRM.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cf-name">Nome *</Label>
            <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Souza" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cf-phone">Telefone *</Label>
            <Input
              id="cf-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 98765-4321"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cf-email">Email</Label>
            <Input
              id="cf-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ana@exemplo.com"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Tags</Label>
            <TagsMultiSelect tags={tags} selectedIds={tagIds} onChange={setTagIds} />
          </div>

          {fields.length > 0 && (
            <div className="grid gap-3 rounded-lg border border-border/60 p-3">
              <p className="text-xs font-semibold text-muted-foreground">Campos customizados</p>
              {fields.map((f) => (
                <div key={f.id} className="grid gap-1.5">
                  <Label htmlFor={`cf-${f.id}`}>{f.label}</Label>
                  {f.field_type === "select" && Array.isArray(f.options) ? (
                    <Select
                      value={customFields[f.id] ?? ""}
                      onValueChange={(v) => setCustomFields((p) => ({ ...p, [f.id]: v }))}
                    >
                      <SelectTrigger id={`cf-${f.id}`}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {(f.options as string[]).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`cf-${f.id}`}
                      type={
                        f.field_type === "number"
                          ? "number"
                          : f.field_type === "date"
                            ? "date"
                            : "text"
                      }
                      value={customFields[f.id] ?? ""}
                      onChange={(e) => setCustomFields((p) => ({ ...p, [f.id]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="cf-notes">Notas</Label>
            <Textarea
              id="cf-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Observações internas…"
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !name || !phone}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar contato
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
