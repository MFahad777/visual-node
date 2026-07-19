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

  // On zoom, ONLY the title's font size changes — the box's padding/layout is fixed
  // world-space so the title's position never shifts. The font counter-scales (1/zoom)
  // so it stays legible when zoomed out; the upper cap reaches 14/minZoom = 14/0.5 = 28
  // so the counter-scaling isn't clipped at the furthest zoom-out. (The padding is
  // deliberately NOT counter-scaled — that's what previously made the title move.)
  const scaleValue = Math.min(Math.max(1 / zoom, 0.5), 2);
  const fontSize = Math.max(10, Math.min(28, 14 * scaleValue));
  const topPadding = 16;
  const sidePadding = 14;
  const bottomPadding = 12;

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
          marginBottom: "4px",
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
            width: "24px",
            height: "24px",
            right: "8px",
            top: "8px",
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
// "changed" and re-render for nothing. (Zoom-driven font changes come in through the
// `useFlowStore`/edge-context zoom subscription, not through NodeProps, so they aren't
// affected by this comparator.)
export const CommentGroupNode = memo(CommentGroupNodeImpl, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.data === nextProps.data &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});
