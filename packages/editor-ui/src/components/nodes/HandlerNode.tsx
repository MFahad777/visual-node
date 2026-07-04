import type { NodeProps } from "@xyflow/react";
import { GenericNode } from "../../canvas/GenericNode.js";

export function HandlerNode(props: NodeProps) {
  return <GenericNode {...props} />;
}
