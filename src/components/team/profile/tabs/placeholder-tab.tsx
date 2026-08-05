export function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{description}</p>
    </div>
  );
}
