/**
 * FB-02 — Barrel público do Flow Builder V2.
 *
 * Consumidores externos (rota, testes) devem importar somente daqui.
 * Nenhum outro caminho de import é considerado API pública.
 */
export { blockRegistry } from "./blocks/registry";
export type {
  BlockDefinition,
  BlockCategory,
  BlockMetaV2,
  BlockHandles,
  HandleSpec,
  ValidationIssue,
  ValidationResult,
  NodePresentationProps,
  InspectorProps,
} from "./blocks/types";

export { useBuilderStore } from "./state/store";
export type { BuilderStore } from "./state/store";
export type {
  BuilderNode,
  BuilderEdge,
  BuilderSelection,
  BuilderGraphSnapshot,
  BuilderMeta,
  BuilderPosition,
  SaveState,
} from "./state/types";
export {
  useNode,
  useEdge,
  useIsSelected,
  useSelectedNode,
  useSelectedNodeId,
  useNodeIds,
  useEdgeIds,
  useDirty,
  useSaveState,
  useFlowId,
} from "./state/selectors";

export { builderBus } from "./events/bus";
export type { BuilderEvent, BuilderEventType, BuilderEventHandler } from "./events/bus";

export { fromServer, toServer, roundTrip } from "./io/serializer";
export type {
  ServerGraphDTO,
  ServerNodeDTO,
  ServerEdgeDTO,
  LoadedGraphDTO,
  LoadedNodeDTO,
  LoadedEdgeDTO,
} from "./io/serializer";

export { validateNode, validateGraph, collectIssues } from "./validation";
export type { GraphValidationEntry } from "./validation";

export { HistoryStack, withHistory, applyHistoryPatches } from "./history/patches";
export type { HistoryPatch, PatchPair } from "./history/patches";

export { useInspectorHost } from "./panel/host";
export type { InspectorHostRender } from "./panel/host";

export { FLOW_BUILDER_V2_ENABLED } from "./flags";
