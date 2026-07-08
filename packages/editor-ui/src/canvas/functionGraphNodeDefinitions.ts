import { createContext, useContext } from "react";
import type { NodeDefinition } from "@visual-node/core";

/**
 * `GenericNode` normally looks up a node's metadata (label, category, config schema) from
 * the global `flowStore.nodeDefinitions` map — but that map is populated from the DEFAULT
 * (unscoped) `/api/node-registry` response, which deliberately excludes
 * `logic.graphEntry`/`logic.graphReturn` (that's what keeps them off the
 * main canvas's NodeBrowserModal/NodePickerMenu). Those types only ever exist inside a
 * Function node's blueprint sub-canvas, rendered by the SAME `GenericNode` component via the
 * shared `nodeTypes` map — so it needs a second, scoped source of definitions for whichever
 * sub-canvas it's currently rendering inside. `FunctionGraphTabView` provides this context with
 * the `?scope=function-graph` definitions; the main canvas never provides it, so `GenericNode`
 * falls back to the global map there, unchanged.
 */
export const FunctionGraphNodeDefinitionsContext = createContext<Record<string, NodeDefinition> | null>(null);

export function useFunctionGraphNodeDefinitions(): Record<string, NodeDefinition> | null {
  return useContext(FunctionGraphNodeDefinitionsContext);
}
