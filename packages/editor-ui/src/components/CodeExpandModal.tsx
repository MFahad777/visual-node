import { lazy, Suspense } from "react";
import { useFlowStore } from "../store/flowStore.js";

const CodeExpandModalContent = lazy(() => import("./CodeExpandModalImpl.js"));

/**
 * Full-screen "expand" editor for `"code"`-type config fields (logic.function's `body`,
 * logic.handlerFunction's `body`, middleware.customCode's `code`) — the embedded 140px
 * CodeMirror box in NodeConfigPanel is cramped for anything beyond a couple of lines.
 *
 * Store-driven singleton, mounted unconditionally in App.tsx (same pattern as
 * CodePreviewModal / NodeBrowserModal) — self-gates via an early `return null` when no
 * field is being expanded. The actual CodeMirror-bearing content lives in
 * `CodeExpandModalImpl.tsx` and is loaded via `lazy()` so the ~517KB codemirror chunk
 * is never fetched until a field is actually expanded, matching the `Lazy*Field`
 * wrapper pattern used elsewhere (`LazyJsCodeField.tsx` etc.).
 *
 * Editing happens on a local `draft` that is NOT live-synced to the store per keystroke
 * (unlike the embedded field) — the embedded editor and this modal must not fight over
 * the same live value while both could theoretically be mounted. "Done" commits the
 * draft explicitly; "Cancel" discards it.
 */
export function CodeExpandModal() {
  const expandedCodeField = useFlowStore((s) => s.expandedCodeField);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.expandedCodeField?.nodeId));
  const nodeDefinitions = useFlowStore((s) => s.nodeDefinitions);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const closeCodeExpand = useFlowStore((s) => s.closeCodeExpand);

  if (!expandedCodeField || !node) return null;

  return (
    <Suspense fallback={null}>
      <CodeExpandModalContent
        expandedCodeField={expandedCodeField}
        node={node}
        nodeDefinitions={nodeDefinitions}
        updateNodeConfig={updateNodeConfig}
        closeCodeExpand={closeCodeExpand}
      />
    </Suspense>
  );
}
