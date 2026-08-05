/**
 * FB-02 — Event Bus interno do Flow Builder.
 *
 * Toda ação relevante do Builder emite um evento tipado neste bus.
 * Extensões (MiniMap, Comentários, Analytics, Debug, Versionamento)
 * escutam sem acoplar-se à store. Nenhum outro pub/sub deve existir
 * dentro do módulo.
 */
export type BuilderEvent =
  | { type: "flow:loaded"; flowId: string }
  | { type: "flow:save-requested" }
  | { type: "flow:save-completed" }
  | { type: "flow:save-cancelled" }
  | { type: "node:selected"; nodeId: string | null }
  | { type: "node:added"; nodeId: string; kind: string }
  | { type: "node:moved"; nodeId: string }
  | { type: "node:updated"; nodeId: string }
  | { type: "node:duplicated"; sourceId: string; newId: string }
  | { type: "node:removed"; nodeId: string }
  | { type: "edge:connected"; edgeId: string }
  | { type: "edge:disconnected"; edgeId: string }
  | { type: "inspector:opened"; nodeId: string }
  | { type: "inspector:closed" };

export type BuilderEventType = BuilderEvent["type"];
export type BuilderEventHandler = (event: BuilderEvent) => void;

class BuilderEventBus {
  private handlers = new Set<BuilderEventHandler>();
  private byType = new Map<BuilderEventType, Set<BuilderEventHandler>>();

  emit(event: BuilderEvent): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[flow-builder/bus] handler error", err);
      }
    }
    const set = this.byType.get(event.type);
    if (set) {
      for (const h of set) {
        try {
          h(event);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[flow-builder/bus] handler error", err);
        }
      }
    }
  }

  /** ouve todos os eventos */
  onAny(handler: BuilderEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** ouve apenas um tipo específico */
  on<T extends BuilderEventType>(
    type: T,
    handler: (event: Extract<BuilderEvent, { type: T }>) => void,
  ): () => void {
    let set = this.byType.get(type);
    if (!set) {
      set = new Set();
      this.byType.set(type, set);
    }
    set.add(handler as BuilderEventHandler);
    return () => set!.delete(handler as BuilderEventHandler);
  }

  /** somente testes */
  _reset(): void {
    this.handlers.clear();
    this.byType.clear();
  }
}

export const builderBus = new BuilderEventBus();
