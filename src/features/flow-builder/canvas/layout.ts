/**
 * FB-10.3.2 — Auto-layout LTR com crossing reduction + collision pass.
 *
 * Evolução da FB-10.3.1
 * ---------------------
 * O núcleo topológico continua o mesmo (Sugiyama-lite: layering por
 * longest-path a partir das raízes reais). Foram adicionados três passes
 * novos, todos determinísticos:
 *
 *   1. Crossing reduction (barycenter) — reordena cada layer olhando a
 *      posição média dos vizinhos na layer adjacente. Passes alternados
 *      forward / backward reduzem cruzamentos sem custo excessivo.
 *
 *   2. Y-shift barycêntrico — cada nó tenta se alinhar verticalmente ao
 *      centro geométrico dos seus PREDECESSORES (bom para nós com
 *      múltiplos incoming e para "Sim/Não" que costumam empilhar mal).
 *
 *   3. Collision resolution — sweep por coluna (mesmo X): força um
 *      gap mínimo em Y entre bounding boxes dos cards V3.
 *
 * Zonas
 * -----
 * Fluxo principal = ancorado no START PRINCIPAL (o `kind==='start'` que
 * alcança MAIS nós; em caso de empate, o primeiro pela ordem original).
 * Todo o resto (starts extras, órfãos puros, ilhas inalcançáveis) forma
 * a **zona de problemas**, desenhada visualmente ABAIXO do fluxo
 * principal (não intercala, não empurra o corpo do fluxo, não modifica
 * dados persistidos — é apenas para leitura visual).
 *
 * IMPORTANTE: a decisão de "start principal" é *exclusivamente* para
 * fins de LAYOUT. O Runtime continua enxergando o grafo como está no
 * banco. O Health já sinaliza a existência de mais de um START.
 *
 * Contrato
 * --------
 *  - Entrada:  nodes + edges (imutáveis) + opções.
 *  - Saída:    Map<id, {x,y}> com posição nova para TODOS os nós.
 *  - Não muta store, não muda edges, data, IDs ou serialização.
 *  - Determinístico: mesmo grafo -> mesma saída (bary ties por
 *    nodeIndex, iteração de layers em ordem numérica).
 *
 * Complexidade: O((N+E) · sweeps) — trivial para 1000+ nós.
 */

export interface LayoutNodeInput {
  id: string;
  kind: string;
}
export interface LayoutEdgeInput {
  source: string;
  target: string;
}
export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  gapX?: number;
  gapY?: number;
  originX?: number;
  originY?: number;
  crossingSweeps?: number;
  /** Distância vertical extra entre fluxo principal e zona de órfãos. */
  problemZoneGap?: number;
}
export type LayoutResult = Map<string, { x: number; y: number }>;

/**
 * FB-12.2 — Heurística "este grafo precisa ser organizado?".
 *
 * Retorna true quando o grafo, ao carregar, veio sem coordenadas humanas
 * úteis. Casos que disparam:
 *   • todos os nós em (0,0) — típico de fluxos importados/legados;
 *   • todos os nós na mesma coordenada (X e Y iguais para todos);
 *   • variância combinada de x/y abaixo de 1px (empilhados).
 * Fluxos com apenas 1 nó, ou já dispersos, retornam false.
 *
 * Determinístico. Sem alocações grandes. Não lê a store.
 */
export function needsAutoLayout(
  nodes: ReadonlyArray<{ id?: string; position: { x: number; y: number } }>,
  opts: LayoutOptions = {},
): boolean {
  if (nodes.length < 2) return false;
  const o = { ...DEFAULTS, ...opts };
  let allZero = true;
  const firstX = nodes[0].position.x;
  const firstY = nodes[0].position.y;
  let sameX = true;
  let sameY = true;
  for (const n of nodes) {
    if (n.position.x !== 0 || n.position.y !== 0) allZero = false;
    if (n.position.x !== firstX) sameX = false;
    if (n.position.y !== firstY) sameY = false;
  }
  if (allZero || (sameX && sameY)) return true;
  // Detecta colisões reais (bounding boxes sobrepostos). Fluxos legados
  // salvos com posicionamento manual ruim (cards empilhados) caem aqui.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i].position;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j].position;
      if (Math.abs(a.x - b.x) < o.nodeWidth && Math.abs(a.y - b.y) < o.nodeHeight) {
        return true;
      }
    }
  }
  return false;
}

const DEFAULTS: Required<LayoutOptions> = {
  nodeWidth: 300,
  nodeHeight: 200,
  gapX: 160,
  gapY: 80,
  originX: 80,
  originY: 80,
  crossingSweeps: 12,
  problemZoneGap: 120,
};

// ---------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------

export function computeLayeredLayout(
  nodes: readonly LayoutNodeInput[],
  edges: readonly LayoutEdgeInput[],
  options: LayoutOptions = {},
): LayoutResult {
  const opts = { ...DEFAULTS, ...options };
  const result: LayoutResult = new Map();
  if (nodes.length === 0) return result;

  // ---- índice + adjacências
  const nodeIndex = new Map<string, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  for (const n of nodes) {
    outAdj.set(n.id, []);
    inAdj.set(n.id, []);
  }
  for (const e of edges) {
    if (!outAdj.has(e.source) || !inAdj.has(e.target)) continue;
    outAdj.get(e.source)!.push(e.target);
    inAdj.get(e.target)!.push(e.source);
  }

  // ---- escolher START PRINCIPAL (apenas layout)
  const starts = nodes.filter((n) => n.kind === "start");
  let primaryStart: string | null = null;
  let primaryReach = -1;
  for (const s of starts) {
    const reach = countReachable(s.id, outAdj);
    const beats =
      primaryStart === null ||
      reach > primaryReach ||
      (reach === primaryReach &&
        nodeIndex.get(s.id)! < nodeIndex.get(primaryStart)!);
    if (beats) {
      primaryStart = s.id;
      primaryReach = reach;
    }
  }

  // ---- raízes do fluxo principal
  const mainRoots: string[] = [];
  if (primaryStart) mainRoots.push(primaryStart);
  for (const n of nodes) {
    if (n.kind === "start") continue;
    const hasIn = (inAdj.get(n.id) ?? []).length > 0;
    const hasOut = (outAdj.get(n.id) ?? []).length > 0;
    if (!hasIn && hasOut) mainRoots.push(n.id);
  }

  // ---- layering longest-path
  const layer = layeringLongestPath(mainRoots, outAdj, nodes.length);

  // ---- separar o que ficou fora do main flow => zona de problemas
  const problemNodes: string[] = [];
  for (const n of nodes) if (!layer.has(n.id)) problemNodes.push(n.id);
  const problemLayer = layeringLongestPath(
    problemRoots(problemNodes, inAdj),
    outAdj,
    nodes.length,
    /* subsetFilter */ (id) => problemNodes.includes(id),
  );
  for (const id of problemNodes) if (!problemLayer.has(id)) problemLayer.set(id, 0);

  // ---- agrupar por layer preservando ordem original como tiebreak
  const mainByLayer = groupByLayer(layer, nodeIndex);
  const problemByLayer = groupByLayer(problemLayer, nodeIndex);

  // ---- crossing reduction (barycenter) no fluxo principal
  reduceCrossings(mainByLayer, inAdj, outAdj, nodeIndex, opts.crossingSweeps);

  // ---- coordenadas iniciais do fluxo principal
  const stepX = opts.nodeWidth + opts.gapX;
  const stepY = opts.nodeHeight + opts.gapY;
  const layerNums = Array.from(mainByLayer.keys()).sort((a, b) => a - b);
  const maxLayerSize = Math.max(
    ...Array.from(mainByLayer.values()).map((a) => a.length),
    1,
  );
  const totalMainH = (maxLayerSize - 1) * stepY;
  for (const l of layerNums) {
    const arr = mainByLayer.get(l)!;
    const layerH = (arr.length - 1) * stepY;
    const yOffset = (totalMainH - layerH) / 2;
    arr.forEach((id, i) => {
      result.set(id, {
        x: opts.originX + l * stepX,
        y: opts.originY + yOffset + i * stepY,
      });
    });
  }

  // ---- y-shift barycêntrico (multi-incoming + branches)
  //     percorre da 2ª layer para frente; para cada nó, tenta puxar o
  //     y para a média dos parents já posicionados; depois força o
  //     gap mínimo dentro da própria layer (na ordem já reduzida).
  for (const l of layerNums) {
    if (l === 0) continue;
    const arr = mainByLayer.get(l)!;
    const preferred: number[] = arr.map((id) => {
      const parents = (inAdj.get(id) ?? []).filter((p) => result.has(p));
      if (parents.length === 0) return result.get(id)!.y;
      let sy = 0;
      for (const p of parents) sy += result.get(p)!.y;
      return sy / parents.length;
    });
    // mantém a ordem definida pelo crossing reduction; garante gap.
    let lastY = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      let y = preferred[i];
      if (i > 0) y = Math.max(y, lastY + stepY);
      lastY = y;
      result.set(arr[i], { x: opts.originX + l * stepX, y });
    }
  }

  // ---- zona de problemas (starts extras, órfãos, ilhas)
  let mainMaxY = opts.originY;
  for (const pos of result.values()) mainMaxY = Math.max(mainMaxY, pos.y);
  const problemBaseY = mainMaxY + stepY + opts.problemZoneGap;
  const problemLayerNums = Array.from(problemByLayer.keys()).sort(
    (a, b) => a - b,
  );
  for (const l of problemLayerNums) {
    const arr = problemByLayer.get(l)!;
    arr.forEach((id, i) => {
      result.set(id, {
        x: opts.originX + l * stepX,
        y: problemBaseY + i * stepY,
      });
    });
  }

  // ---- collision pass: por coluna X, empurra para baixo até respeitar gap.
  const byX = new Map<number, string[]>();
  for (const [id, pos] of result) {
    const key = Math.round(pos.x);
    if (!byX.has(key)) byX.set(key, []);
    byX.get(key)!.push(id);
  }
  for (const ids of byX.values()) {
    ids.sort((a, b) => result.get(a)!.y - result.get(b)!.y);
    for (let i = 1; i < ids.length; i++) {
      const prev = result.get(ids[i - 1])!;
      const cur = result.get(ids[i])!;
      const minY = prev.y + stepY;
      if (cur.y < minY) result.set(ids[i], { x: cur.x, y: minY });
    }
  }

  return result;
}

/**
 * Retorna posição "segura" para inserir um novo nó a partir de
 * `sourceId`, evitando sobreposição com nós existentes no eixo Y.
 * Preservada da FB-10.3.1.
 */
export function nextSlotFrom(
  sourceId: string,
  nodesById: Record<string, { position: { x: number; y: number } }>,
  outEdgesFromSource: string[],
  opts: LayoutOptions = {},
): { x: number; y: number } {
  const o = { ...DEFAULTS, ...opts };
  const src = nodesById[sourceId];
  if (!src) return { x: o.originX, y: o.originY };
  const baseX = src.position.x + o.nodeWidth + o.gapX;
  let baseY = src.position.y;
  if (outEdgesFromSource.length > 0) {
    let maxY = -Infinity;
    for (const cid of outEdgesFromSource) {
      const c = nodesById[cid];
      if (c && c.position.y > maxY) maxY = c.position.y;
    }
    if (maxY > -Infinity) baseY = maxY + o.nodeHeight + o.gapY;
  }
  return { x: baseX, y: baseY };
}

/**
 * Diagnóstico — conta pares de nós que se sobrepõem dentro do layout.
 * Usado por testes (FB-10.3.2 requer 0 colisões) e pode ser exposto no
 * futuro para o Health.
 */
export function countCollisions(
  positions: LayoutResult,
  opts: LayoutOptions = {},
): number {
  const o = { ...DEFAULTS, ...opts };
  const entries = Array.from(positions.entries());
  let n = 0;
  for (let i = 0; i < entries.length; i++) {
    const [, a] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [, b] = entries[j];
      if (
        Math.abs(a.x - b.x) < o.nodeWidth &&
        Math.abs(a.y - b.y) < o.nodeHeight
      ) {
        n++;
      }
    }
  }
  return n;
}

/**
 * Diagnóstico — conta cruzamentos de edges considerando a ordem intra-layer.
 * Só faz sentido comparar antes/depois do mesmo grafo.
 */
export function countCrossings(
  nodes: readonly LayoutNodeInput[],
  edges: readonly LayoutEdgeInput[],
  positions: LayoutResult,
): number {
  // Para cada par de edges (a, b) tal que a.source e b.source estão na
  // mesma "coluna" (mesmo X arredondado) e a.target e b.target estão em
  // outra mesma coluna, cruzam se as ordens verticais forem opostas.
  const known = edges.filter(
    (e) => positions.has(e.source) && positions.has(e.target),
  );
  let n = 0;
  for (let i = 0; i < known.length; i++) {
    const a = known[i];
    const as = positions.get(a.source)!;
    const at = positions.get(a.target)!;
    for (let j = i + 1; j < known.length; j++) {
      const b = known[j];
      const bs = positions.get(b.source)!;
      const bt = positions.get(b.target)!;
      // Ambas as arestas devem ir da mesma coluna X para a mesma coluna X.
      if (Math.round(as.x) !== Math.round(bs.x)) continue;
      if (Math.round(at.x) !== Math.round(bt.x)) continue;
      const sourceOrder = as.y - bs.y;
      const targetOrder = at.y - bt.y;
      if (sourceOrder === 0 || targetOrder === 0) continue;
      if (Math.sign(sourceOrder) !== Math.sign(targetOrder)) n++;
    }
  }
  // Também considera nós desconhecidos como não-cruzamento.
  void nodes;
  return n;
}

// ---------------------------------------------------------------------
// helpers privados
// ---------------------------------------------------------------------

function countReachable(
  from: string,
  outAdj: Map<string, string[]>,
): number {
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    for (const t of outAdj.get(id) ?? []) {
      if (!seen.has(t)) {
        seen.add(t);
        stack.push(t);
      }
    }
  }
  return seen.size;
}

function layeringLongestPath(
  roots: readonly string[],
  outAdj: Map<string, string[]>,
  nodeCount: number,
  subsetFilter?: (id: string) => boolean,
): Map<string, number> {
  const layer = new Map<string, number>();
  if (roots.length === 0) return layer;
  for (const r of roots) layer.set(r, 0);
  const queue = [...roots];
  let head = 0;
  const iterCap = Math.max(64, nodeCount * nodeCount);
  let iter = 0;
  while (head < queue.length && iter++ < iterCap) {
    const id = queue[head++];
    const l = layer.get(id)!;
    for (const t of outAdj.get(id) ?? []) {
      if (subsetFilter && !subsetFilter(t)) continue;
      const prev = layer.get(t);
      if (prev === undefined || prev < l + 1) {
        layer.set(t, l + 1);
        queue.push(t);
      }
    }
  }
  return layer;
}

function problemRoots(
  problemNodes: readonly string[],
  inAdj: Map<string, string[]>,
): string[] {
  const set = new Set(problemNodes);
  const roots: string[] = [];
  for (const id of problemNodes) {
    const parentsInSubset = (inAdj.get(id) ?? []).filter((p) => set.has(p));
    if (parentsInSubset.length === 0) roots.push(id);
  }
  return roots;
}

function groupByLayer(
  layer: Map<string, number>,
  nodeIndex: Map<string, number>,
): Map<number, string[]> {
  const byLayer = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }
  for (const arr of byLayer.values()) {
    arr.sort((a, b) => nodeIndex.get(a)! - nodeIndex.get(b)!);
  }
  return byLayer;
}

function reduceCrossings(
  byLayer: Map<number, string[]>,
  inAdj: Map<string, string[]>,
  outAdj: Map<string, string[]>,
  nodeIndex: Map<string, number>,
  sweeps: number,
): void {
  const layerNums = Array.from(byLayer.keys()).sort((a, b) => a - b);
  if (layerNums.length < 2) return;

  const positionInLayer = new Map<string, number>();
  const rebuildPositions = () => {
    positionInLayer.clear();
    for (const l of layerNums) {
      byLayer.get(l)!.forEach((id, i) => positionInLayer.set(id, i));
    }
  };
  rebuildPositions();

  const barycenter = (id: string, useIn: boolean): number => {
    const neigh = useIn ? inAdj.get(id) : outAdj.get(id);
    if (!neigh || neigh.length === 0) {
      return positionInLayer.get(id) ?? 0;
    }
    let sum = 0;
    let cnt = 0;
    for (const nid of neigh) {
      const p = positionInLayer.get(nid);
      if (p === undefined) continue;
      sum += p;
      cnt++;
    }
    return cnt === 0 ? positionInLayer.get(id) ?? 0 : sum / cnt;
  };

  for (let sweep = 0; sweep < sweeps; sweep++) {
    const forward = sweep % 2 === 0;
    const order = forward ? layerNums : [...layerNums].reverse();
    for (const l of order) {
      // Camada de referência não muda: forward pula 1ª, backward pula última.
      if (forward && l === layerNums[0]) continue;
      if (!forward && l === layerNums[layerNums.length - 1]) continue;
      const arr = byLayer.get(l)!;
      const scored = arr.map((id) => ({
        id,
        b: barycenter(id, forward),
        i: nodeIndex.get(id)!,
      }));
      // ordenação estável: barycenter asc, tiebreak por ordem original.
      scored.sort((a, b) => a.b - b.b || a.i - b.i);
      byLayer.set(
        l,
        scored.map((s) => s.id),
      );
      rebuildPositions();
    }
  }
}
