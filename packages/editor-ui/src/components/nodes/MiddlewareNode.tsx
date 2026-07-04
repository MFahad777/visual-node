import type { NodeProps } from "@xyflow/react";
import { GenericNode } from "../../canvas/GenericNode.js";

export function MiddlewareNode(props: NodeProps) {
  return <GenericNode {...props} />;
}
