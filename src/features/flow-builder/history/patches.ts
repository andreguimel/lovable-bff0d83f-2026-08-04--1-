/**
 * FB-02 — Preparação de Undo/Redo por patches (immer).
 *
 * Nesta missão a store *ainda não* usa patches em produção; o mecanismo
 * fica preparado para ser plugado em FB-06 sem refatorar chamadores.
 * Cada mutação da store passa por `withHistory(state, mutator)`, que
 * devolve os patches de ida e volta. O consumidor (FB-06) empilha
 * `inversePatches` em `past`, e `redo` reaplica `patches`.
 */
import { produceWithPatches, applyPatches, enablePatches, type Patch } from "immer";

enablePatches();

export type HistoryPatch = Patch;

export interface PatchPair {
  forward: HistoryPatch[];
  inverse: HistoryPatch[];
}

/**
 * Executa `mutator` sobre `state` usando immer e devolve o novo estado
 * junto dos patches de ida/volta. Uso:
 *
 *   const { next, pair } = withHistory(state, (draft) => { draft.x++ });
 *   past.push(pair.inverse);
 */
export function withHistory<T extends object>(
  state: T,
  mutator: (draft: T) => void,
): { next: T; pair: PatchPair } {
  const [next, forward, inverse] = produceWithPatches(
    state as unknown as object,
    (draft) => mutator(draft as T),
  );
  return { next: next as T, pair: { forward, inverse } };
}

export function applyHistoryPatches<T extends object>(state: T, patches: HistoryPatch[]): T {
  return applyPatches(state as unknown as object, patches) as T;
}

/** Pilha simples com limite. Reutilizável em FB-06. */
export class HistoryStack {
  private past: PatchPair[] = [];
  private future: PatchPair[] = [];

  constructor(private limit = 100) {}

  push(pair: PatchPair): void {
    if (pair.inverse.length === 0 && pair.forward.length === 0) return;
    this.past.push(pair);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(): PatchPair | undefined {
    const p = this.past.pop();
    if (p) this.future.push(p);
    return p;
  }

  redo(): PatchPair | undefined {
    const p = this.future.pop();
    if (p) this.past.push(p);
    return p;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
