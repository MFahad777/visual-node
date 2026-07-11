import { useState } from "react";
import type { Node } from "@xyflow/react";

export default function CommentExpandModalContent({
  node,
  updateNodeConfig,
  closeCommentExpand,
}: {
  node: Node;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
  closeCommentExpand: () => void;
}) {
  const currentValue = String(node.data?.comment ?? "");
  const [draft, setDraft] = useState<string>(currentValue);

  const handleDone = () => {
    updateNodeConfig(node.id, "comment", draft);
    closeCommentExpand();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[90vh] w-[90vw] flex-col rounded-lg bg-neutral-800 shadow-lg">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">Edit Comment</h2>
          <button onClick={closeCommentExpand} className="text-neutral-400 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-full w-full resize-none rounded border border-neutral-700 bg-[#1f1f1f] px-3 py-2 font-mono text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-sky-400"
            placeholder="Add a detailed comment..."
          />
        </div>

        <div className="border-t border-neutral-700 px-4 py-3 text-[11px] text-neutral-400">
          Compiles to a /** ... */ comment block directly above this node's generated code.
        </div>

        <div className="border-t border-black/60 px-4 py-3">
          <div className="flex justify-end gap-2">
            <button
              onClick={closeCommentExpand}
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
