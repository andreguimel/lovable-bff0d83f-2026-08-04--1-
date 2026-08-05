import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ConversationsTab({ data }: { data: any }) {
  const conv = data.conversations ?? [];
  if (conv.length === 0) return <Empty text="Nenhuma conversa atribuída." />;
  return (
    <div className="space-y-2">
      {conv.map((c: any) => (
        <Card key={c.id} className="p-3 flex items-center justify-between hover:bg-muted/40 transition">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
            <div className="text-sm">{c.subject ?? "Sem assunto"}</div>
          </div>
          <div className="text-[11px] text-muted-foreground">{new Date(c.updated_at).toLocaleString("pt-BR")}</div>
        </Card>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground rounded-2xl border border-dashed">{text}</div>;
}
