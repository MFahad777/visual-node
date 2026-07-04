import type { NodeProps } from "@xyflow/react";
import { GenericNode } from "../../canvas/GenericNode.js";

export function DebugNode(props: NodeProps) {
  return <GenericNode {...props} />;
}
