import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createChannel, updateChannel, listStevoInstancesFn } from "@/lib/channels.functions";
import { useQuery } from "@tanstack/react-query";

const providers = [
  { value: "whatsapp_cloud", label: "WhatsApp Cloud API" },
  { value: "whatsapp_business", label: "WhatsApp Business" },
  { value: "baileys", label: "Baileys" },
  { value: "evolution", label: "Evolution API" },
  { value: "stevo", label: "Stevo" },
];

const colors = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ef4444", "#eab308", "#06b6d4", "#ec4899"];

type Existing = {
  id: string;
  name: string;
  phone_number: string | null;
  provider_type: string | null;
  color: string | null;
  credentials?: Record<string, unknown> | null;
} | null;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Existing;
}

export function ChannelFormSheet({ open, onOpenChange, existing }: Props) {
  const qc = useQueryClient();
  const create = useServerFn(createChannel);
  const update = useServerFn(updateChannel);

  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone_number ?? "");
  const [provider, setProvider] = useState(existing?.provider_type ?? "whatsapp_cloud");
  const [color, setColor] = useState(existing?.color ?? "#22c55e");
  const [stevoInstanceId, setStevoInstanceId] = useState(
    typeof existing?.credentials?.instance_id === "string" ? (existing.credentials.instance_id as string) : "",
  );


  // Sincroniza o formulário sempre que abrir (ou trocar de canal). Sem isso, os
  // estados iniciais ficam presos ao primeiro render e um "salvar" em modo edição
  // sobrescreve o provider real do canal (ex.: stevo -> whatsapp_cloud).
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setPhone(existing?.phone_number ?? "");
    setProvider(existing?.provider_type ?? "whatsapp_cloud");
    setColor(existing?.color ?? "#22c55e");
    setStevoInstanceId(
      typeof existing?.credentials?.instance_id === "string"
        ? (existing.credentials.instance_id as string)
        : "",
    );
  }, [open, existing]);

  const listStevo = useServerFn(listStevoInstancesFn);
  const stevo = useQuery({
    queryKey: ["stevo-instances"],
    queryFn: () => listStevo(),
    enabled: open && provider === "stevo",
    staleTime: 30_000,
  });

  const m = useMutation({
    mutationFn: async () => {
      const stevoCreds = provider === "stevo"
        ? { credentials: { instance_id: stevoInstanceId } }
        : {};

      if (existing) {
        return update({
          data: {
            id: existing.id,
            patch: {
              name,
              phone_number: phone || null,
              provider_type: provider as "whatsapp_cloud",
              color,
              ...stevoCreds,
            },
          },
        });
      }
      return create({
        data: {
          name,
          phone_number: phone || undefined,
          provider_type: provider as "whatsapp_cloud",
          color,
          ...stevoCreds,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success(existing ? "Canal atualizado" : "Canal criado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existing ? "Editar canal" : "Novo canal"}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Comercial SP" />
          </div>
          <div className="space-y-2">
            <Label>Número</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 90000-0000" />
          </div>
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {provider === "stevo" && (
            <>

              <div className="space-y-2">
                <Label>Instância Stevo</Label>
                {stevo.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando instâncias da Stevo…</p>
                ) : stevo.data && !stevo.data.ok ? (
                  <>
                    <Input
                      value={stevoInstanceId}
                      onChange={(e) => setStevoInstanceId(e.target.value)}
                      placeholder="ID da instância"
                    />
                    <p className="text-xs text-destructive">{stevo.data.message}</p>
                  </>
                ) : (
                  <Select
                    value={stevoInstanceId}
                    onValueChange={(val) => {
                      setStevoInstanceId(val);
                      if (val && val !== "__create__") {
                        const found = (stevo.data?.instances ?? []).find((i) => i.id === val);
                        if (found) {
                          if (!name.trim() && found.name) setName(found.name);
                          if (!phone.trim() && found.phone) setPhone(found.phone);
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma instância da Stevo" />
                    </SelectTrigger>
                    <SelectContent>
                      {(stevo.data?.instances ?? []).map((i) => {
                        const displayName = i.name || `Instância ${i.id.slice(0, 8)}`;
                        const statusLabel = i.connected ? "Conectada" : "Desconectada";
                        const phoneLabel = i.phone ? ` (${i.phone})` : "";
                        return (
                          <SelectItem key={i.id} value={i.id}>
                            <div className="flex items-center justify-between gap-2">
                              <span>{displayName}{phoneLabel}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${i.connected ? "bg-emerald-500/10 text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                                {statusLabel}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                      <SelectItem value="__create__" className="font-medium text-primary">
                        + Criar e ativar nova instância na Stevo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Selecione uma das instâncias existentes na sua conta Stevo para conectar a este canal.
                </p>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-lg border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!name || m.isPending || (provider === "stevo" && !stevoInstanceId)}>
            {m.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
