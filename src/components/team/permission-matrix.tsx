import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PERMISSION_MODULES, ROLE_CATALOG } from "./constants";
import { setRolePermissions } from "@/lib/team-studio.functions";

type PermMap = Record<string, boolean>; // key: role|module|action

export function PermissionMatrix({ initial }: { initial: any[] }) {
  const [role, setRole] = useState("operator");
  const [q, setQ] = useState("");
  const [perms, setPerms] = useState<PermMap>(() => {
    const m: PermMap = {};
    for (const r of initial) m[`${r.role}|${r.module}|${r.action}`] = r.allowed;
    return m;
  });
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const saveFn = useServerFn(setRolePermissions);
  const save = useMutation({
    mutationFn: () => {
      const updates = Array.from(dirty)
        .filter((k) => k.startsWith(role + "|"))
        .map((k) => {
          const [, module, action] = k.split("|");
          return { module, action, allowed: !!perms[k] };
        });
      return saveFn({ data: { role, updates } });
    },
    onSuccess: () => { toast.success("Permissões salvas"); setDirty(new Set()); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const filteredModules = useMemo(
    () => PERMISSION_MODULES.filter((m) => !q || m.label.toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  const toggle = (module: string, action: string) => {
    const key = `${role}|${module}|${action}`;
    setPerms((p) => ({ ...p, [key]: !p[key] }));
    setDirty((d) => new Set(d).add(key));
  };

  const toggleAll = (module: string, val: boolean) => {
    const mod = PERMISSION_MODULES.find((m) => m.key === module);
    if (!mod) return;
    setPerms((p) => {
      const next = { ...p };
      for (const a of mod.actions) next[`${role}|${module}|${a}`] = val;
      return next;
    });
    setDirty((d) => {
      const next = new Set(d);
      for (const a of mod.actions) next.add(`${role}|${module}|${a}`);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {ROLE_CATALOG.map((r) => (
          <button
            key={r.key}
            onClick={() => setRole(r.key)}
            className={`px-3 py-2 rounded-xl border text-xs font-medium transition ${role === r.key ? "border-primary bg-primary/10" : "border-border/60"}`}
          >
            <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: r.color }} />
            {r.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar módulo..." className="pl-9 h-9" />
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={dirty.size === 0 || save.isPending}>
          Salvar ({Array.from(dirty).filter((k) => k.startsWith(role + "|")).length})
        </Button>
      </div>

      <div className="rounded-2xl border border-border/60 divide-y">
        {filteredModules.map((mod) => (
          <div key={mod.key} className="p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium text-sm">{mod.label}</div>
              <div className="text-[11px] text-muted-foreground">{mod.actions.join(" · ")}</div>
            </div>
            <div className="flex items-center gap-1.5">
              {mod.actions.map((a) => {
                const key = `${role}|${mod.key}|${a}`;
                const on = !!perms[key];
                return (
                  <button key={a} className="perm-cell" data-allowed={on} onClick={() => toggle(mod.key, a)} title={a}>
                    {on ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-50" />}
                  </button>
                );
              })}
              <div className="ml-2 flex flex-col gap-1">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => toggleAll(mod.key, true)}>Tudo</Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => toggleAll(mod.key, false)}>Nada</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
