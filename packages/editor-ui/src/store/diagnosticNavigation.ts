import { useFlowStore } from "./flowStore.js";
import { useEditorTabsStore } from "./editorTabsStore.js";
import { focusNodeOnCanvas } from "../canvas/canvasFocus.js";
import type { ValidationError } from "../api/client.js";
import type { Node } from "@xyflow/react";

/**
 * Polls for canvas registration using requestAnimationFrame with a bounded attempt count.
 * Returns a promise that resolves once the node is successfully focused, or after
 * attemptsLeft runs out.
 */
async function waitForCanvasFocus(scope: string, nodeId: string, attemptsLeft = 10): Promise<void> {
  if (focusNodeOnCanvas(scope, nodeId)) {
    return;
  }
  if (attemptsLeft <= 0) {
    return;
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return waitForCanvasFocus(scope, nodeId, attemptsLeft - 1);
}

/**
 * Navigates to a diagnostic error/warning by:
 * 1. Opening the file if needed (for whole-project compile errors)
 * 2. Walking the path frames, opening each intermediate Function/Promise/Handler-Function tab
 * 3. Selecting the final node and focusing the camera on it
 */
export async function navigateToDiagnostic(
  diag: ValidationError & { relativePath?: string }
): Promise<void> {
  const flow = useFlowStore.getState();

  // Step 1: If this diagnostic is from a different file, open it
  if (diag.relativePath && diag.relativePath !== flow.currentFilePath) {
    await flow.openFile(diag.relativePath);
  }

  // Early exit if there's no path (diagnostic with no specific node attribution)
  if (diag.path.length === 0) {
    return;
  }

  // Step 2: Walk the path frames, opening each intermediate tab
  let parentTabId = "main";
  for (let i = 0; i < diag.path.length - 1; i++) {
    const frame = diag.path[i];

    // Find the node in the current scope (main canvas or a tab's function graph)
    const ownerNodes =
      parentTabId === "main"
        ? useFlowStore.getState().nodes
        : useEditorTabsStore.getState().functionGraphTabs.find((t) => t.functionNodeId === parentTabId)?.store.getState().nodes ?? [];

    const outerNode = ownerNodes.find((n) => n.id === frame.nodeId);
    if (!outerNode) {
      // Stale diagnostic — node has been deleted or renamed away
      return;
    }

    // Open the next nested tab
    useEditorTabsStore.getState().openFunctionGraphTab(outerNode as Node, parentTabId);
    parentTabId = frame.nodeId;
  }

  // Step 3: Select the final node and focus the camera
  const finalFrame = diag.path[diag.path.length - 1];
  if (parentTabId === "main") {
    useFlowStore.getState().selectNode(finalFrame.nodeId);
  } else {
    useEditorTabsStore.getState().functionGraphTabs.find((t) => t.functionNodeId === parentTabId)?.store.getState().selectNode(finalFrame.nodeId);
  }

  // Step 4: Focus the canvas with polling (bounded to ~10 attempts)
  await waitForCanvasFocus(parentTabId, finalFrame.nodeId);
}
