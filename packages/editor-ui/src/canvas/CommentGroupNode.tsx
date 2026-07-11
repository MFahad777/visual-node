import { NodeResizer, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo } from "react";
import { useFlowStore } from "../store/flowStore.js";
import { useFunctionGraphEdgeContext } from "./functionGraphEdgeContext.js";

export function CommentGroupNodeImpl({
  id,
  data,
  selected,
  width = 220,
  height = 120,
}: NodeProps) {
  const globalZoom = useFlowStore((s) => s.currentZoom);
  const scopedEdgeContext = useFunctionGraphEdgeContext();
  const zoom = scopedEdgeContext?.currentZoom ?? globalZoom;

  const { title = "Comment", color = "#4b4b63" } = data as Record<string, any>;

  // Use function-graph-scoped updateNodeData if available, otherwise fall back to global
  // updateNodeConfig (Phase 6 pattern, same as GenericNode.tsx lines 145–192).
  const globalUpdateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const updateNodeData = scopedEdgeContext?.updateNodeData ?? globalUpdateNodeConfig;

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeData(id, "title", e.target.value);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeData(id, "color", e.target.value);
  };

  const scaleValue = Math.min(Math.max(1 / zoom, 0.5), 2);
  const fontSize = Math.max(10, Math.min(20, 14 * scaleValue));
  const topPadding = 16 * scaleValue;
  const sidePadding = 14 * scaleValue;
  const bottomPadding = 12 * scaleValue;

  return (
    <div
      className="relative h-full w-full rounded-lg border-2 text-white transition-all duration-200"
      style={{
        backgroundColor: `${color}33`,
        borderColor: color,
        padding: `${topPadding}px ${sidePadding}px ${bottomPadding}px`,
        fontSize: `${fontSize}px`,
      }}
    >
      {selected && <NodeResizer minWidth={100} minHeight={80} />}

      <input
        type="text"
        value={title}
        onChange={handleTitleChange}
        className="nodrag nopan w-full border-0 bg-transparent font-semibold text-white outline-none"
        placeholder="Comment"
        style={{
          fontSize: `${fontSize}px`,
          marginBottom: `${4 * scaleValue}px`,
        }}
      />

      {selected && (
        <input
          type="color"
          value={color}
          onChange={handleColorChange}
          className="nodrag nopan absolute cursor-pointer border-0"
          title="Box color"
          style={{
            width: `${Math.max(16, Math.min(28, 24 * scaleValue))}px`,
            height: `${Math.max(16, Math.min(28, 24 * scaleValue))}px`,
            right: `${8 * scaleValue}px`,
            top: `${8 * scaleValue}px`,
          }}
        />
      )}
    </div>
  );
}

// A1 (mirrors GenericNode.tsx): custom comparator comparing only `id`, `selected`, `data`,
// `width`, and `height` — the fields CommentGroupNodeImpl actually destructures from NodeProps.
// React Flow injects `xPos`/`yPos`/`dragging`/`positionAbsolute` as real values that change
// every frame while this node is being dragged; a default shallow-compare would see them as
// "changed" and re-run the scaleValue/fontSize/padding math every frame for nothing.
export const CommentGroupNode = memo(CommentGroupNodeImpl, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.data === nextProps.data &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});
