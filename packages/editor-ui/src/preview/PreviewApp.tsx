import { useEffect } from 'react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { Node as RFNode } from '@xyflow/react';
import type { NodeDefinition } from '@visual-node/core';
import { useFlowStore } from '../store/flowStore.js';
import { nodeTypes } from '../canvas/nodeTypes.js';
import nodeRegistry from './node-registry.json';

/**
 * Standalone preview harness for rendering a single node in isolation.
 * Reads `type` (required) and `data` (optional, JSON-encoded) from query string.
 * Example: `preview.html?type=express.route&data={"path":"/users","method":"GET"}`
 */
export function PreviewApp() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const dataStr = params.get('data');

    if (!type) {
      console.error("Missing required 'type' query parameter");
      return;
    }

    let data: Record<string, unknown> = {};
    if (dataStr) {
      try {
        data = JSON.parse(decodeURIComponent(dataStr));
      } catch (e) {
        console.error("Failed to parse 'data' query parameter:", e);
      }
    }

    const previewNode: RFNode = {
      id: 'preview',
      type,
      data,
      position: { x: 0, y: 0 },
    };

    useFlowStore.setState({
      nodeDefinitions: nodeRegistry as any as Record<string, NodeDefinition>,
      nodes: [previewNode],
      edges: [],
    });
  }, []);

  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);

  return (
    <div style={{ width: '100vw', height: '100vh' }} className="node-preview-readonly">
      {/* This is a static visual demo embedded in the docs, not a live editor — the
          literal-value <input>/<Checkbox>/<button> elements GenericNode renders for
          unwired pins are plain DOM, outside react-flow's own drag/connect/pan props
          above, so a click-drag inside one (e.g. selecting text) still bubbled into a
          native browser drag gesture and shifted the surrounding docs page. Blocking
          pointer-events on every interactive element is the only thing that reaches
          those, since there's no react-flow prop for it. */}
      <style>{`
        .node-preview-readonly input,
        .node-preview-readonly button,
        .node-preview-readonly select,
        .node-preview-readonly textarea,
        .node-preview-readonly .react-flow__handle {
          pointer-events: none;
        }
      `}</style>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          fitView
        />
      </ReactFlowProvider>
    </div>
  );
}
