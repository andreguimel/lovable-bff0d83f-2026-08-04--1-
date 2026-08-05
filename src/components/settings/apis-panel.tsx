import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, KeyRound, Loader2, PencilLine, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PROVIDERS,
  type ProviderId,
  deleteIntegration,
  getIntegrationForEdit,
  listIntegrations,
  regenerateWebhookSecret,
  testIntegration,
  toggleIntegration,
  upsertIntegration,
} from "@/lib/integrations.functions";

type IntegrationRow = {
  id: string;
  provider: ProviderId;
  label: string;
  credentials_masked: Record<string, string>;
  config: Record<string, string>;
  webhook_url: string | null;
  webhook_secret_masked: string | null;
  enabled: boolean;
  last_tested_at: string | null;
  test_status: string | null;
  test_error: string | null;
};

export function ApisPanel() {
  const qc = useQueryClient();
  const { data: rows = [], isPending } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listIntegrations(),
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState<ProviderId>("resend");

  function openNew() {
    setEditingId(null);
    setNewProvider("resend");
    setEditorOpen(true);
  }

  function openEdit(id: string) {
    setEditingId(id);
    setEditorOpen(true);
  }

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      toggleIntegration({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteIntegration({ data: { id } }),
    onSuccess: () => {
      toast.success("Integração removida");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testIntegration({ data: { id } }),
    onSuccess: (res) => {
      if (res.status === "ok") toast.success("Conexão OK");
      else toast.error("Falha no teste", { description: res.error ?? undefined });
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Integrações</h2>
          <p className="text-xs text-muted-foreground">
            Cadastre as chaves de API e webhooks manualmente. Somente administradores editam.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar integração
        </Button>
      </div>

      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Nenhuma integração configurada"
          description="Adicione Resend, OpenAI, Meta ou Stripe para começar."
          action={<Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Adicionar integração</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(rows as IntegrationRow[]).map((row) => (
            <IntegrationCard
              key={row.id}
              row={row}
              onEdit={() => openEdit(row.id)}
              onDelete={() => {
                if (confirm("Remover esta integração?")) deleteMut.mutate(row.id);
              }}
              onToggle={(v) => toggleMut.mutate({ id: row.id, enabled: v })}
              onTest={() => testMut.mutate(row.id)}
              testing={testMut.isPending && testMut.variables === row.id}
            />
          ))}
        </div>
      )}

      <IntegrationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editingId={editingId}
        defaultProvider={newProvider}
        onSaved={() => {
          setEditorOpen(false);
          qc.invalidateQueries({ queryKey: ["integrations"] });
        }}
      />
    </div>
  );
}

function IntegrationCard({
  row,
  onEdit,
  onDelete,
  onToggle,
  onTest,
  testing,
}: {
  row: IntegrationRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const def = PROVIDERS.find((p) => p.id === row.provider);
  const testBadge = row.test_status === "ok"
    ? <Badge className="gap-1 bg-success/15 text-success" variant="secondary"><CheckCircle2 className="h-3 w-3" /> Testado</Badge>
    : row.test_status === "error"
    ? <Badge variant="secondary" className="gap-1 text-destructive"><XCircle className="h-3 w-3" /> Erro no teste</Badge>
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> {def?.name ?? row.provider}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{row.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {row.enabled ? "Ativa" : "Inativa"}
          </span>
          <Switch checked={row.enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {row.enabled ? (
            <Badge className="gap-1 bg-success/15 text-success" variant="secondary">
              <CheckCircle2 className="h-3 w-3" /> Ativa
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-muted-foreground">
              <XCircle className="h-3 w-3" /> Desativada
            </Badge>
          )}
          {testBadge}
        </div>

        {Object.keys(row.credentials_masked).length > 0 ? (
          <div className="grid gap-1 text-xs">
            {Object.entries(row.credentials_masked).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
          </div>
        ) : null}

        {row.test_error ? (
          <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
            {row.test_error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <PencilLine className="mr-1 h-3 w-3" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            Testar
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1 h-3 w-3" /> Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationEditor({
  open,
  onOpenChange,
  editingId,
  defaultProvider,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingId: string | null;
  defaultProvider: ProviderId;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const editQuery = useQuery({
    queryKey: ["integration-edit", editingId],
    queryFn: () => getIntegrationForEdit({ data: { id: editingId! } }),
    enabled: !!editingId && open,
  });

  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [label, setLabel] = useState("Padrão");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);

  // Sync when editor data arrives or dialog opens
  useMemo(() => {
    if (!open) return;
    if (editingId && editQuery.data) {
      setProvider(editQuery.data.provider);
      setLabel(editQuery.data.label);
      setCredentials({});
      setConfig(editQuery.data.config ?? {});
      setEnabled(editQuery.data.enabled);
    } else if (!editingId) {
      setProvider(defaultProvider);
      setLabel("Padrão");
      setCredentials({});
      setConfig({});
      setEnabled(true);
    }
  }, [open, editingId, editQuery.data, defaultProvider]);

  const def = PROVIDERS.find((p) => p.id === provider);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertIntegration({
        data: {
          id: editingId ?? undefined,
          provider,
          label,
          credentials,
          config,
          enabled,
        },
      }),
    onSuccess: () => {
      toast.success(editingId ? "Integração atualizada" : "Integração criada");
      onSaved();
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const regenMut = useMutation({
    mutationFn: () => regenerateWebhookSecret({ data: { id: editingId! } }),
    onSuccess: () => {
      toast.success("Segredo regenerado");
      qc.invalidateQueries({ queryKey: ["integration-edit", editingId] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const inboundUrl = useMemo(() => {
    if (!def?.hasInboundWebhook || typeof window === "undefined") return null;
    const base = window.location.origin;
    const slug = provider.replace(/_/g, "-");
    return `${base}/api/public/webhooks/${slug}/${editingId ?? "<crie-primeiro>"}`;
  }, [def, provider, editingId]);

  function copy(text: string) {
    if (typeof navigator === "undefined") return;
    navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingId ? "Editar integração" : "Nova integração"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {!editingId ? (
            <div className="grid gap-2">
              <Label>Provedor</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {def ? <p className="text-xs text-muted-foreground">{def.description}</p> : null}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Rótulo</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Produção" />
          </div>

          {def?.credentialFields.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label>{f.label}</Label>
              <Input
                type={f.secret ? "password" : "text"}
                placeholder={
                  editingId
                    ? "Deixe em branco para manter o valor atual"
                    : f.placeholder
                }
                value={credentials[f.key] ?? ""}
                onChange={(e) => setCredentials({ ...credentials, [f.key]: e.target.value })}
              />
            </div>
          ))}

          {def?.configFields.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label>{f.label}</Label>
              <Input
                placeholder={f.placeholder}
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
              />
            </div>
          ))}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ativa</p>
              <p className="text-xs text-muted-foreground">Desative para pausar sem excluir.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {def?.hasInboundWebhook && editingId ? (
            <div className="grid gap-2 rounded border p-3">
              <p className="text-sm font-medium">Webhook de entrada</p>
              <div className="grid gap-1 text-xs">
                <span className="text-muted-foreground">URL do webhook</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1">{inboundUrl}</code>
                  <Button size="icon" variant="ghost" onClick={() => inboundUrl && copy(inboundUrl)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <span className="mt-2 text-muted-foreground">Verify token</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1">
                    {editQuery.data?.credentials?.verify_token ?? "—"}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      editQuery.data?.credentials?.verify_token &&
                      copy(editQuery.data.credentials.verify_token)
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <span className="mt-2 text-muted-foreground">Webhook secret (HMAC)</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1">
                    {editQuery.data?.webhook_secret ?? "—"}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      editQuery.data?.webhook_secret && copy(editQuery.data.webhook_secret)
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => regenMut.mutate()}
                disabled={regenMut.isPending}
              >
                <RefreshCw className="mr-2 h-3 w-3" /> Regenerar segredos
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
