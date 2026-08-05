import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveMemberProfile } from "@/lib/team-studio.functions";

export function EditProfileTab({ data, userId, onSaved }: { data: any; userId: string; onSaved: () => void }) {
  const ext = data.extension ?? {};
  const [form, setForm] = useState({
    phone: ext.phone ?? "",
    whatsapp: ext.whatsapp ?? "",
    job_title: ext.job_title ?? "",
    department_id: ext.department_id ?? "",
    ai_agent_id: ext.ai_agent_id ?? "",
    hire_date: ext.hire_date ?? "",
    bio: ext.bio ?? "",
    timezone: ext.timezone ?? "America/Sao_Paulo",
  });

  const saveFn = useServerFn(saveMemberProfile);
  const m = useMutation({
    mutationFn: () => saveFn({ data: { userId, ...form, department_id: form.department_id || null, ai_agent_id: form.ai_agent_id || null, hire_date: form.hire_date || null } }),
    onSuccess: () => { toast.success("Perfil salvo"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Cargo"><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></Field>
      <Field label="Departamento">
        <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {(data.departments ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Field>
      <Field label="Data de entrada"><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
      <Field label="Agente IA vinculado">
        <Select value={form.ai_agent_id} onValueChange={(v) => setForm({ ...form, ai_agent_id: v })}>
          <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
          <SelectContent>
            {(data.agents ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Bio"><Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field>
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Salvar alterações</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
