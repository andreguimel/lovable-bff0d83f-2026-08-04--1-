import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Shield, Users2, Sparkles, Building2, ListOrdered, Mail, Key, History, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getTeamOverview } from "@/lib/team-studio.functions";
import { TeamKpis } from "@/components/team/team-kpis";
import { ViewSwitcher, type TeamView } from "@/components/team/view-switcher";
import { MemberCard } from "@/components/team/member-card";
import { MembersTable } from "@/components/team/members-table";
import { OrgChart } from "@/components/team/org-chart";
import { InviteWizard } from "@/components/team/invite-wizard";
import { DepartmentsPanel } from "@/components/team/departments-panel";
import { QueuesPanel } from "@/components/team/queues-panel";
import { InvitesPanel } from "@/components/team/invites-panel";
import { PermissionsMatrixV2 } from "@/components/rbac/PermissionsMatrix";
import { EntityHistoryTimeline } from "@/components/history/EntityHistoryTimeline";
import { TeamCopilotSheet } from "@/components/team/team-copilot-sheet";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/team/")({
  head: () => ({
    meta: [
      { title: "Equipe — Centro de Gestão" },
      { name: "description", content: "Gerencie sua equipe, cargos, permissões, filas e performance em um único lugar." },
    ],
  }),
  component: TeamPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

function TeamPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<TeamView>("cards");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [tab, setTab] = useState("members");

  const { data, isPending } = useQuery({
    queryKey: ["team-overview"],
    queryFn: () => getTeamOverview(),
  });

  // Realtime: refresh overview on invite / profile / role changes
  useEffect(() => {
    const channel = supabase.channel("team-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_invites" },
        () => qc.invalidateQueries({ queryKey: ["team-overview"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_member_profiles" },
        () => qc.invalidateQueries({ queryKey: ["team-overview"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" },
        () => qc.invalidateQueries({ queryKey: ["team-overview"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const filteredMembers = useMemo(() => {
    let members = data?.members ?? [];
    if (q) {
      const term = q.toLowerCase();
      members = members.filter((m: any) =>
        (m.full_name ?? "").toLowerCase().includes(term) ||
        (m.email ?? "").toLowerCase().includes(term) ||
        (m.job_title ?? "").toLowerCase().includes(term) ||
        (m.phone ?? "").toLowerCase().includes(term),
      );
    }
    if (roleFilter !== "all") members = members.filter((m: any) => m.role === roleFilter);
    if (deptFilter !== "all") members = members.filter((m: any) => m.department?.id === deptFilter);
    const sorted = [...members];
    if (sortBy === "name") sorted.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
    else if (sortBy === "role") sorted.sort((a, b) => (a.role ?? "").localeCompare(b.role ?? ""));
    else if (sortBy === "recent") sorted.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return sorted;
  }, [data, q, roleFilter, deptFilter, sortBy]);

  const invitesCount = (data?.invites ?? []).filter((i: any) => (i.status ?? "pending") === "pending").length;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="studio-header">
        <div className="studio-avatar"><Users2 className="h-7 w-7" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">Centro de Gestão da Equipe</h1>
          <p className="text-sm text-muted-foreground">
            {data?.members.length ?? 0} colaboradores · {invitesCount} convites pendentes · {data?.kpis.active_agents ?? 0} agentes IA ativos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/team/roles">
            <Button variant="outline" size="sm"><Shield className="h-4 w-4 mr-1.5" /> Cargos & Permissões</Button>
          </Link>
          <TeamCopilotSheet trigger={<Button variant="outline" size="sm"><Sparkles className="h-4 w-4 mr-1.5" /> Copiloto</Button>} />
          <InviteWizard trigger={<Button size="sm"><UserPlus className="h-4 w-4 mr-1.5" /> Novo Membro</Button>} />
        </div>
      </div>

      <TeamKpis kpis={data?.kpis ?? {}} />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="members"><Users2 className="h-4 w-4 mr-1.5" />Membros
            <Badge variant="secondary" className="ml-2 text-[10px]">{data?.members.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="departments"><Building2 className="h-4 w-4 mr-1.5" />Departamentos
            <Badge variant="secondary" className="ml-2 text-[10px]">{data?.departments.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="queues"><ListOrdered className="h-4 w-4 mr-1.5" />Filas
            <Badge variant="secondary" className="ml-2 text-[10px]">{data?.queues.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="invites"><Mail className="h-4 w-4 mr-1.5" />Convites
            {invitesCount > 0 && <Badge className="ml-2 text-[10px]">{invitesCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="permissions"><Key className="h-4 w-4 mr-1.5" />Permissões</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1.5" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, email, cargo, telefone…" className="pl-9 h-9" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Cargo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cargos</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Operador</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Departamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os depts</SelectItem>
                  {(data?.departments ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome A–Z</SelectItem>
                  <SelectItem value="role">Cargo</SelectItem>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                </SelectContent>
              </Select>
              <ViewSwitcher value={view} onChange={setView} />
            </div>
          </div>

          {isPending ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl border border-border/60 bg-card animate-pulse" />
              ))}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-xl">
              Nenhum resultado. Ajuste a busca ou filtros.
            </div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map((m: any) => <MemberCard key={m.id} m={m} />)}
            </div>
          ) : view === "table" || view === "list" ? (
            <MembersTable members={filteredMembers} />
          ) : (
            <OrgChart members={filteredMembers} departments={data?.departments ?? []} />
          )}
        </TabsContent>

        <TabsContent value="departments" className="mt-4">
          <DepartmentsPanel />
        </TabsContent>

        <TabsContent value="queues" className="mt-4">
          <QueuesPanel />
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          <InvitesPanel invites={data?.invites ?? []} />
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <PermissionsMatrixV2 />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <EntityHistoryTimeline />
        </TabsContent>
      </Tabs>
    </div>
  );
}
