import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Circle, Loader2, Rocket, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { dismissOnboarding, getOnboardingSummary } from "@/lib/onboarding.functions";

type Step = {
  key: keyof {
    step_channel_created: boolean;
    step_whatsapp_connected: boolean;
    step_agent_created: boolean;
    step_first_message_sent: boolean;
  };
  title: string;
  desc: string;
  href: "/channels" | "/agents" | "/inbox";
};

const STEPS: Step[] = [
  { key: "step_channel_created", title: "Criar seu primeiro canal", desc: "Cadastre um número de WhatsApp na aba Canais.", href: "/channels" },
  { key: "step_whatsapp_connected", title: "Conectar ao WhatsApp Cloud", desc: "Preencha as credenciais Meta no drawer do canal.", href: "/channels" },
  { key: "step_agent_created", title: "Criar um agente IA", desc: "Configure prompt e personalidade em Agentes.", href: "/agents" },
  { key: "step_first_message_sent", title: "Enviar a primeira mensagem", desc: "Abra a Inbox e responda uma conversa.", href: "/inbox" },
];

export function OnboardingChecklist() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["onboarding-summary"],
    queryFn: () => getOnboardingSummary(),
    refetchOnWindowFocus: true,
  });

  const dismiss = useMutation({
    mutationFn: () => dismissOnboarding(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-summary"] }),
  });

  if (isPending || !data) return null;
  if (data.progress.dismissed_at || data.progress.completed_at) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Comece por aqui</h3>
              <p className="text-xs text-muted-foreground">
                {data.percent}% completo — {STEPS.length - STEPS.filter((s) => data.progress[s.key]).length} passos restantes.
              </p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => dismiss.mutate()}
            aria-label="Dispensar"
            disabled={dismiss.isPending}
          >
            {dismiss.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </Button>
        </div>

        <Progress value={data.percent} className="mt-4 h-1.5" />

        <ul className="mt-4 grid gap-2">
          {STEPS.map((step) => {
            const done = data.progress[step.key];
            return (
              <li key={step.key}>
                <Link
                  to={step.href}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/60 p-3 transition-colors hover:bg-accent/40"
                >
                  {done ? (
                    <div className="grid h-6 w-6 place-items-center rounded-full bg-success/20 text-success">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  ) : (
                    <Circle className="h-6 w-6 text-muted-foreground/40" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${done ? "line-through opacity-60" : ""}`}>{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
