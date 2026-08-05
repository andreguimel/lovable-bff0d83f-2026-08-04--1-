import { Link } from "@tanstack/react-router";
import { Building2, Phone, Mail, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import { LeadScorePill, LeadScoreBar } from "@/components/crm/lead-score";

type Row = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  stage: string | null;
  value_cents: number | null;
  lead_score: number;
  last_interaction_at: string | null;
  next_action: string | null;
  tags: Array<{ id: string; name: string; color: string }>;
};

const brl = (cents: number | null) =>
  cents == null
    ? null
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);

export function CardsView({ rows }: { rows: Row[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((c) => {
        const value = brl(c.value_cents);
        return (
          <Link
            key={c.id}
            to="/crm/$contactId"
            params={{ contactId: c.id }}
            className="contact-card no-underline"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-base font-bold text-primary">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                {c.company_name ? (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" /> {c.company_name}
                  </p>
                ) : (
                  c.email && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" /> {c.email}
                    </p>
                  )
                )}
              </div>
              <LeadScorePill score={c.lead_score} />
            </div>

            <LeadScoreBar score={c.lead_score} />

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {c.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </span>
                )}
              </div>
              {value && <span className="font-semibold text-foreground tabular-nums">{value}</span>}
            </div>

            {c.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.tags.slice(0, 4).map((t) => (
                  <Badge
                    key={t.id}
                    variant="secondary"
                    className="h-4 border-0 px-1.5 text-[10px]"
                    style={{ backgroundColor: t.color + "22", color: t.color }}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                <ClientTime iso={c.last_interaction_at} />
              </span>
              {c.next_action && <span className="truncate italic">{c.next_action}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
