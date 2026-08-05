import { ArrowRight, Sparkles, Bot, MessageSquare, Workflow, Users, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Zenda Hero — landing marketing surface.
 * Design Language V2 (violet, enterprise, IA-first). Pure presentation.
 */
export function ZendaHero({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden bg-[oklch(0.145_0.005_285)] text-white",
        className,
      )}
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, color-mix(in oklab, #6D5EF7 28%, transparent), transparent 60%), radial-gradient(900px 500px at 85% 20%, color-mix(in oklab, #A855F7 18%, transparent), transparent 65%)",
        }}
      />
      {/* Grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center sm:pt-28">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
          <Sparkles className="h-3 w-3 text-[#A855F7]" />
          Zenda AI CRM · Enterprise Edition
        </div>

        {/* Title */}
        <h1 className="mt-6 font-display text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
          Zenda{" "}
          <span className="bg-gradient-to-r from-[#A855F7] via-[#8B5CF6] to-[#6D5EF7] bg-clip-text text-transparent">
            AI CRM
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-5 max-w-2xl text-balance text-lg leading-relaxed text-white/70 sm:text-xl">
          A plataforma inteligente que unifica Atendimento, CRM, IA, Fluxos,
          WhatsApp e Automações em um único lugar.
        </p>

        {/* Description */}
        <p className="mt-3 max-w-xl text-sm text-white/50">
          Construa experiências incríveis para seus clientes, automatize processos com IA
          e escale seu atendimento com uma plataforma criada para empresas de alta performance.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="group h-11 rounded-full bg-gradient-to-r from-[#6D5EF7] to-[#8B5CF6] px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(109,94,247,0.6)] hover:opacity-95"
          >
            <Link to="/auth">
              Entrar na Plataforma
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="h-11 rounded-full border border-white/10 bg-white/[0.03] px-6 text-sm font-medium text-white/85 backdrop-blur hover:bg-white/[0.07] hover:text-white"
          >
            <a href="mailto:contato@zenda.app?subject=Agendar%20Demonstra%C3%A7%C3%A3o">
              Agendar Demonstração
            </a>
          </Button>
        </div>

        {/* Feature strip */}
        <div className="mt-14 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {[
            { icon: MessageSquare, label: "Inbox" },
            { icon: Users, label: "CRM" },
            { icon: Bot, label: "Agentes IA" },
            { icon: Workflow, label: "Fluxos" },
            { icon: Zap, label: "Campanhas" },
            { icon: Sparkles, label: "Guardião" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs font-medium text-white/70 backdrop-blur transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
            >
              <Icon className="h-3.5 w-3.5 text-[#A855F7]" />
              {label}
            </div>
          ))}
        </div>

        {/* Mock control center card */}
        <div className="relative mt-16 w-full max-w-5xl">
          <div
            aria-hidden
            className="absolute -inset-x-10 -top-6 -bottom-4 -z-10 rounded-[40px] blur-3xl"
            style={{
              background:
                "linear-gradient(180deg, rgba(109,94,247,0.35), rgba(168,85,247,0.15) 60%, transparent)",
            }}
          />
          <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111113] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]">
            {/* Fake window chrome */}
            <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="ml-4 text-[11px] font-medium text-white/40">
                zenda.app / dashboard
              </span>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-3">
              {[
                { label: "Conversas hoje", value: "1.284", delta: "+12%" },
                { label: "Taxa de resposta IA", value: "94%", delta: "+3%" },
                { label: "Leads qualificados", value: "312", delta: "+27%" },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                    {k.label}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <div className="font-display text-2xl font-semibold text-white">
                      {k.value}
                    </div>
                    <div className="text-xs font-semibold text-[#22C55E]">{k.delta}</div>
                  </div>
                  <div className="mt-3 h-10 rounded-lg bg-gradient-to-r from-[#6D5EF7]/20 via-[#8B5CF6]/10 to-transparent" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ZendaHero;
