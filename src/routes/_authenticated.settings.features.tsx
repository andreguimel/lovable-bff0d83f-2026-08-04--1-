import { createFileRoute } from "@tanstack/react-router";
import { FEATURES } from "@/lib/features/registry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings/features")({
  head: () => ({ meta: [{ title: "Features · Zenda" }] }),
  component: FeaturesPage,
});

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  stable: "default",
  beta: "secondary",
  experimental: "outline",
  deprecated: "destructive",
  removed: "destructive",
};

function FeaturesPage() {
  const byModule = FEATURES.reduce<Record<string, typeof FEATURES>>((acc, f) => {
    (acc[f.module] ??= []).push(f);
    return acc;
  }, {});
  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Feature Registry</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catálogo declarativo das capacidades da plataforma. Fonte única de verdade para o pipeline
          de execução, o Guardião e o RBAC.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(byModule).map(([mod, list]) => (
          <Card key={mod}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base capitalize">{mod}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {list.map((f) => (
                <div key={f.key} className="border-l-2 border-border pl-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{f.name}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        v{f.version}
                      </Badge>
                      <Badge variant={statusVariant[f.status]} className="text-[10px] capitalize">
                        {f.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                  {(f.permission || f.featureFlag) && (
                    <div className="flex gap-2 mt-2 text-[10px] text-muted-foreground">
                      {f.permission && (
                        <span>
                          perm: <code>{f.permission}</code>
                        </span>
                      )}
                      {f.featureFlag && (
                        <span>
                          flag: <code>{f.featureFlag}</code>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
