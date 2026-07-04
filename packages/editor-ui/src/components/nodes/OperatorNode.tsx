import type { NodeProps } from "@xyflow/react";
import { GenericNode } from "../../canvas/GenericNode.js";

export function OperatorNode(props: NodeProps) {
  return <GenericNode {...props} />;
}
