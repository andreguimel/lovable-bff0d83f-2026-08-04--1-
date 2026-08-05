import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMemberProfile } from "@/lib/team-studio.functions";
import { ProfileHeader } from "@/components/team/profile/profile-header";
import { TabsNav } from "@/components/team/profile/tabs-nav";
import { OverviewTab } from "@/components/team/profile/tabs/overview-tab";
import { ConversationsTab } from "@/components/team/profile/tabs/conversations-tab";
import { EditProfileTab } from "@/components/team/profile/tabs/edit-profile-tab";
import { PlaceholderTab } from "@/components/team/profile/tabs/placeholder-tab";

export const Route = createFileRoute("/_authenticated/team/$memberId")({
  head: () => ({ meta: [{ title: "Perfil do colaborador — Equipe" }] }),
  component: MemberProfilePage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <div className="text-sm text-destructive mb-3">Erro: {error.message}</div>
        <Button size="sm" onClick={() => { router.invalidate(); reset(); }}>Tentar novamente</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-sm">Membro não encontrado.</div>,
});

function MemberProfilePage() {
  const { memberId } = Route.useParams();
  const [tab, setTab] = useState("overview");

  const { data, isPending, refetch } = useQuery({
    queryKey: ["team-member", memberId],
    queryFn: () => getMemberProfile({ data: { memberId } }),
  });

  if (isPending) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="p-6 text-sm">Sem dados.</div>;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Link to="/team" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-3 w-3" /> Voltar para Equipe
      </Link>

      <ProfileHeader
        profile={data.profile}
        extension={data.extension}
        role={data.role}
        presence={data.presence}
        onEdit={() => setTab("edit")}
        onMessage={() => setTab("conversations")}
      />

      <TabsNav value={tab} onChange={setTab} />

      <div>
        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "edit" && <EditProfileTab data={data} userId={memberId} onSaved={() => refetch()} />}
        {tab === "conversations" && <ConversationsTab data={data} />}
        {tab === "activities" && <PlaceholderTab title="Timeline de atividades" description="Todas as ações realizadas pelo colaborador (mensagens, atribuições, alterações no CRM, execuções de fluxos)." />}
        {tab === "tasks" && <PlaceholderTab title="Tarefas & pendências" description="Checklist de tarefas atribuídas, pendentes e concluídas, integrado com CRM e Fluxos." />}
        {tab === "ai" && <PlaceholderTab title="IA vinculada" description="Agente IA assistente do colaborador, atendimentos realizados pela IA, transferências e desempenho." />}
        {tab === "channels" && <PlaceholderTab title="Canais & filas" description="Quais WhatsApps, filas, páginas e integrações este membro atende." />}
        {tab === "schedule" && <PlaceholderTab title="Agenda & escala" description="Jornada de trabalho, turnos, pausas, férias e ausências programadas." />}
        {tab === "stats" && <PlaceholderTab title="Estatísticas de performance" description="Tempo médio, primeira resposta, conversão, resolução, SLA, campanhas, fluxos e IA." />}
      </div>
    </div>
  );
}
