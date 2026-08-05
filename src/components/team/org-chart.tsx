import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@tanstack/react-router";

export function OrgChart({ members, departments }: { members: any[]; departments: any[] }) {
  const byDept = new Map<string, any[]>();
  const noDept: any[] = [];
  for (const m of members) {
    if (m.department?.id) {
      const arr = byDept.get(m.department.id) ?? [];
      arr.push(m);
      byDept.set(m.department.id, arr);
    } else noDept.push(m);
  }

  return (
    <div className="space-y-6">
      {departments.map((d) => {
        const mems = byDept.get(d.id) ?? [];
        if (mems.length === 0) return null;
        return (
          <div key={d.id} className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              <h3 className="font-semibold text-sm">{d.name}</h3>
              <span className="text-xs text-muted-foreground">· {mems.length} pessoas</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {mems.map((m) => (
                <Link key={m.id} to="/team/$memberId" params={{ memberId: m.id }} className="org-node hover:border-primary/40 transition">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{(m.full_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-xs font-medium">{m.full_name ?? m.email}</div>
                    <div className="text-[10px] text-muted-foreground">{m.job_title ?? m.role}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      {noDept.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border p-4">
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">Sem departamento</h3>
          <div className="flex flex-wrap gap-3">
            {noDept.map((m) => (
              <Link key={m.id} to="/team/$memberId" params={{ memberId: m.id }} className="org-node">
                <Avatar className="h-8 w-8"><AvatarFallback>{(m.full_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="text-xs">{m.full_name ?? m.email}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
