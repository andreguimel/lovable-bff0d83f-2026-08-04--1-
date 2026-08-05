import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getWorkspace,
  updateWorkspace,
  updateProfile,
  updateNotificationPrefs,
} from "@/lib/settings.functions";
import { ApisPanel } from "@/components/settings/apis-panel";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "Ajustes — Zenda" },
      { name: "description", content: "Configurações de workspace, perfil, notificações e APIs." },
    ],
  }),
  component: SettingsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

function SettingsPage() {
  const { data, isPending } = useQuery({
    queryKey: ["workspace-settings"],
    queryFn: () => getWorkspace(),
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Personalize sua workspace, perfil, notificações e integrações.</p>
      </div>

      {isPending || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="workspace">
          <TabsList>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="profile">Perfil</TabsTrigger>
            <TabsTrigger value="notifications">Notificações</TabsTrigger>
            <TabsTrigger value="apis">APIs</TabsTrigger>
            <TabsTrigger value="feature-flags" asChild><a href="/settings/feature-flags">Feature Flags</a></TabsTrigger>
          </TabsList>

          <TabsContent value="workspace" className="mt-4">
            <WorkspaceForm
              company={data.company}
              canEdit={data.role === "admin"}
            />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <ProfileForm profile={data.profile} />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <NotificationsForm prefs={(data.profile.notification_prefs as Record<string, boolean>) ?? {}} />
          </TabsContent>
          <TabsContent value="apis" className="mt-4">
            <ApisPanel />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function WorkspaceForm({
  company,
  canEdit,
}: {
  company: { id: string; name: string; timezone: string; locale: string } | null;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(company?.name ?? "");
  const [tz, setTz] = useState(company?.timezone ?? "America/Sao_Paulo");
  const [locale, setLocale] = useState(company?.locale ?? "pt-BR");

  const m = useMutation({
    mutationFn: () => updateWorkspace({ data: { name, timezone: tz, locale } }),
    onSuccess: () => {
      toast.success("Workspace atualizada");
      qc.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Workspace</CardTitle></CardHeader>
      <CardContent className="grid max-w-lg gap-4">
        <div className="grid gap-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="grid gap-2">
          <Label>Fuso horário</Label>
          <Input value={tz} onChange={(e) => setTz(e.target.value)} disabled={!canEdit} placeholder="America/Sao_Paulo" />
        </div>
        <div className="grid gap-2">
          <Label>Idioma</Label>
          <Input value={locale} onChange={(e) => setLocale(e.target.value)} disabled={!canEdit} placeholder="pt-BR" />
        </div>
        {canEdit ? (
          <Button onClick={() => m.mutate()} disabled={m.isPending} className="w-fit">
            {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Somente administradores podem editar esta seção.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileForm({
  profile,
}: {
  profile: { full_name: string | null; email: string | null; avatar_url: string | null };
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.full_name ?? "");
  const [avatar, setAvatar] = useState(profile.avatar_url ?? "");

  const m = useMutation({
    mutationFn: () => updateProfile({ data: { full_name: name, avatar_url: avatar || null } }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Perfil</CardTitle></CardHeader>
      <CardContent className="grid max-w-lg gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-muted">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-lg font-bold text-muted-foreground">
                {(name || profile.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <Label>URL do avatar</Label>
            <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>E-mail</Label>
          <Input value={profile.email ?? ""} disabled />
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending} className="w-fit">
          {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

const NOTIF_ITEMS: Array<{ key: string; label: string; desc: string }> = [
  { key: "desktop", label: "Notificações desktop", desc: "Receber pop-ups no navegador" },
  { key: "sound", label: "Som ao receber mensagem", desc: "Reproduz um pequeno alerta" },
  { key: "daily_digest", label: "E-mail de resumo diário", desc: "Receba KPIs às 8h" },
  { key: "cascade_alerts", label: "Alertas de cascatas", desc: "Notificar quando uma cascata se esgotar" },
];

function NotificationsForm({ prefs }: { prefs: Record<string, boolean> }) {
  const qc = useQueryClient();
  const [state, setState] = useState<Record<string, boolean>>({
    desktop: prefs.desktop ?? true,
    sound: prefs.sound ?? true,
    daily_digest: prefs.daily_digest ?? false,
    cascade_alerts: prefs.cascade_alerts ?? true,
  });

  useEffect(() => {
    setState((s) => ({ ...s, ...prefs }));
  }, [prefs]);

  const m = useMutation({
    mutationFn: (next: Record<string, boolean>) => updateNotificationPrefs({ data: { prefs: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-settings"] }),
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  function toggle(key: string, v: boolean) {
    const next = { ...state, [key]: v };
    setState(next);
    m.mutate(next);
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Notificações</CardTitle></CardHeader>
      <CardContent className="grid max-w-lg gap-3">
        {NOTIF_ITEMS.map((item, i) => (
          <div key={item.key}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={state[item.key] ?? false}
                onCheckedChange={(v) => toggle(item.key, v)}
              />
            </div>
            {i < NOTIF_ITEMS.length - 1 ? <Separator className="mt-3" /> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}