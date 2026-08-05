import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Mail, CheckCircle2, XCircle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { previewInvite, acceptInviteByToken } from "@/lib/team.functions";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Aceitar convite — Talkebase" },
      { name: "description", content: "Aceite seu convite para participar da equipe." },
    ],
  }),
  ssr: false,
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const previewFn = useServerFn(previewInvite);
  const { data, isPending } = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => previewFn({ data: { token } }),
  });

  const acceptFn = useServerFn(acceptInviteByToken);
  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { token } }),
    onSuccess: () => { toast.success("Convite aceito"); navigate({ to: "/team" }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  if (isPending) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando convite…</div>;
  }

  if (!data?.found) {
    return (
      <Wrap>
        <XCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold mt-3">Convite inválido</h1>
        <p className="text-sm text-muted-foreground mt-1">Este link não existe ou já foi cancelado.</p>
      </Wrap>
    );
  }

  if (data.status !== "pending") {
    return (
      <Wrap>
        <Clock className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold mt-3">Convite {data.status === "accepted" ? "já aceito" : data.status}</h1>
        <p className="text-sm text-muted-foreground mt-1">Peça um novo convite ao administrador.</p>
      </Wrap>
    );
  }

  if (data.expired) {
    return (
      <Wrap>
        <Clock className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold mt-3">Convite expirado</h1>
        <p className="text-sm text-muted-foreground mt-1">Peça um novo convite ao administrador da empresa.</p>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
        <Mail className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold mt-3">Você foi convidado</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Para a empresa <span className="font-medium text-foreground">{data.company_name}</span>
        {" "}como <span className="font-medium text-foreground">{data.role}</span>.
      </p>
      <p className="text-xs text-muted-foreground mt-1">Convite enviado para {data.email}</p>

      <div className="mt-6 w-full">
        {session ? (
          <Button className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {accept.isPending ? "Aceitando…" : "Aceitar convite"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Faça login ou crie sua conta para aceitar.
            </p>
            <Link to="/auth" search={{ redirect: `/invite/${token}` } as any} className="block">
              <Button className="w-full">Entrar ou criar conta</Button>
            </Link>
          </div>
        )}
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 flex flex-col items-center text-center">
        {children}
      </div>
    </div>
  );
}
