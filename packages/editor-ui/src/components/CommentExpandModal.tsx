import { lazy, Suspense } from "react";
import type { Node } from "@xyflow/react";
import { useFlowStore } from "../store/flowStore.js";
import { useEditorTabsStore, type FunctionGraphTab } from "../store/editorTabsStore.js";

const CommentExpandModalContent = lazy(() => import("./CommentExpandModalImpl.js"));

/**
 * Mounted once in App.tsx as a sibling of FunctionGraphTabView, so it can't reach a
 * function-graph tab's scoped store via `useFunctionGraphEdgeContext()` (that context is only
 * provided within FunctionGraphTabView's own render tree). Instead it picks between two inner
 * components depending on whether a function-graph tab is active, mirroring the outer/inner
 * split `FunctionGraphSidePanel.tsx` already uses (`key={tab.functionNodeId}` forces a clean
 * remount per tab) — this keeps the outer component's hook calls constant across renders
 * (Rules of Hooks) while the actual store-reading hooks live in whichever child gets mounted.
 */
export function CommentExpandModal() {
  const activeTabId = useEditorTabsStore((s) => s.activeTabId);
  const tab = useEditorTabsStore((s) => s.functionGraphTabs.find((t) => t.functionNodeId === activeTabId));

  if (tab) return <ScopedCommentExpandModal key={tab.functionNodeId} tab={tab} />;
  return <MainCommentExpandModal />;
}

function MainCommentExpandModal() {
  const expandedCommentField = useFlowStore((s) => s.expandedCommentField);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.expandedCommentField?.nodeId));
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const closeCommentExpand = useFlowStore((s) => s.closeCommentExpand);

  if (!expandedCommentField || !node) return null;

  return (
    <Suspense fallback={null}>
      <CommentExpandModalContent
        node={node}
        updateNodeConfig={updateNodeConfig}
        closeCommentExpand={closeCommentExpand}
      />
    </Suspense>
  );
}

function ScopedCommentExpandModal({ tab }: { tab: FunctionGraphTab }) {
  const useGraphStore = tab.store;
  const expandedCommentField = useGraphStore((s) => s.expandedCommentField);
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === s.expandedCommentField?.nodeId));
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const closeCommentExpand = useGraphStore((s) => s.closeCommentExpand);

  if (!expandedCommentField || !node) return null;

  return (
    <Suspense fallback={null}>
      <CommentExpandModalContent
        node={node as Node}
        updateNodeConfig={updateNodeData}
        closeCommentExpand={closeCommentExpand}
      />
    </Suspense>
  );
}
