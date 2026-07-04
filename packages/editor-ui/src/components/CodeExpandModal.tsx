import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { Node } from "@xyflow/react";
import type { NodeDefinition } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { CODE_MIRROR_BASIC_SETUP, CODE_MIRROR_THEME, extensionsForField, isJsCodeField } from "./codeEditorShared.js";

/**
 * Full-screen "expand" editor for `"code"`-type config fields (logic.function's `body`,
 * handler.customCode's `code`, middleware.customCode's `code`) — the embedded 140px
 * CodeMirror box in NodeConfigPanel is cramped for anything beyond a couple of lines.
 *
 * Store-driven singleton, mounted unconditionally in App.tsx (same pattern as
 * CodePreviewModal / NodeBrowserModal) — self-gates via an early `return null` when no
 * field is being expanded.
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

  return expandedCodeField && node ? (
    <CodeExpandModalContent
      expandedCodeField={expandedCodeField}
      node={node}
      nodeDefinitions={nodeDefinitions}
      updateNodeConfig={updateNodeConfig}
      closeCodeExpand={closeCodeExpand}
    />
  ) : null;
}

/**
 * Split out from `CodeExpandModal` so the `draft` state (initialized via `useState`'s
 * lazy initializer from the current field value) is created fresh every time a
 * different field/node is expanded — this component only exists while
 * `expandedCodeField` is non-null, so it fully unmounts on close rather than being
 * hidden, matching the remount-safety convention used elsewhere for CodeMirror fields.
 */
function CodeExpandModalContent({
  expandedCodeField,
  node,
  nodeDefinitions,
  updateNodeConfig,
  closeCodeExpand,
}: {
  expandedCodeField: { nodeId: string; fieldKey: string; fieldLabel: string };
  node: Node;
  nodeDefinitions: Record<string, NodeDefinition>;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
  closeCodeExpand: () => void;
}) {
  const definition = node.type ? nodeDefinitions[node.type] : undefined;
  const field = definition?.configSchema.find((f) => f.key === expandedCodeField.fieldKey);
  const currentValue = node.data?.[expandedCodeField.fieldKey];
  const isJs = field ? isJsCodeField(field) : true;

  const [draft, setDraft] = useState<string>(() =>
    isJs ? String(currentValue ?? "") : JSON.stringify(currentValue ?? field?.default, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  if (!field) return null;

  const handleDone = () => {
    if (isJs) {
      updateNodeConfig(expandedCodeField.nodeId, expandedCodeField.fieldKey, draft);
      closeCodeExpand();
      return;
    }
    try {
      const parsed = JSON.parse(draft);
      updateNodeConfig(expandedCodeField.nodeId, expandedCodeField.fieldKey, parsed);
      closeCodeExpand();
    } catch {
      setError("Invalid JSON");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[90vh] w-[min(1100px,90vw)] flex-col rounded-lg border border-black/60 bg-[#242424] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-black/60 px-4 py-2">
          <h2 className="text-sm font-semibold text-neutral-100">
            {definition?.label ?? node.type} — {expandedCodeField.fieldLabel}
          </h2>
          <button onClick={closeCodeExpand} className="text-neutral-500 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-2">
          <CodeMirror
            key={`${expandedCodeField.nodeId}:${expandedCodeField.fieldKey}`}
            value={draft}
            theme={CODE_MIRROR_THEME}
            height="70vh"
            extensions={extensionsForField(field)}
            basicSetup={CODE_MIRROR_BASIC_SETUP}
            onChange={(next) => {
              setDraft(next);
              if (!isJs) setError(null);
            }}
          />
        </div>

        <div className="border-t border-black/60 px-4 py-3">
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={closeCodeExpand}
              className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
