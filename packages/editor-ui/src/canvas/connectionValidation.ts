import type { Connection, Edge } from "@xyflow/react";
import type { NodeDefinition } from "@visual-node/core";
import { computeEffectiveInputs, computeEffectiveOutputs } from "./effectivePorts.js";
import { isExecPort } from "./execPorts.js";

interface ConnectableNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

/**
 * A wire may only join two pins of the same kind — execution-to-execution or
 * value-to-value, never a mix. (Left/target-to-right/source directionality is already
 * enforced by react-flow's default `connectionMode="strict"`, since every input pin
 * renders as a `target` handle on the left and every output as a `source` handle on the
 * right — this only adds the kind check react-flow has no concept of.) Shared by
 * `FlowCanvas.tsx` and `FunctionGraphTabView.tsx`'s `isValidConnection` so a drag is
 * rejected mid-gesture instead of only being flagged later by `runValidation()`.
 * Resolves both endpoints' actual `PortDefinition` via the same
 * `computeEffectiveInputs`/`computeEffectiveOutputs` helpers `GenericNode.tsx`/
 * `CustomEdge.tsx` already use, so dynamically synthesized pins (Branch's true/false,
 * Switch's case-<n>) are judged correctly too. Fails open (returns true) when a port
 * can't be resolved, rather than blocking connections this check wasn't designed to
 * reason about.
 */
export function isValidPinConnection(
  connection: Connection | Edge,
  nodes: ConnectableNode[],
  definitionFor: (type: string | undefined) => NodeDefinition | undefined,
): boolean {
  if (connection.source === connection.target) return false;

  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  const sourceDefinition = definitionFor(sourceNode?.type);
  const targetDefinition = definitionFor(targetNode?.type);
  if (!sourceDefinition || !targetDefinition) return true;

  const sourcePort = computeEffectiveOutputs(sourceNode?.type, sourceNode?.data, sourceDefinition).find(
    (p) => p.id === connection.sourceHandle,
  );
  const targetPort = computeEffectiveInputs(targetNode?.type, targetNode?.data, targetDefinition).find(
    (p) => p.id === connection.targetHandle,
  );
  if (!sourcePort || !targetPort) return true;

  return isExecPort(sourcePort) === isExecPort(targetPort);
}
