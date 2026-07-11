import { useEffect, useState } from "react";

export interface NodeCommentEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onClose: () => void;
  onExpand: (currentText: string) => void;
}

/**
 * Compact modal editor for node comments, with an expand button to open the full-screen
 * `CommentExpandModal`. Dismisses on Escape or Save/Cancel button.
 */
export function NodeCommentEditor({ initialValue, onSave, onClose, onExpand }: NodeCommentEditorProps) {
  const [text, setText] = useState(initialValue);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="flex w-96 flex-col rounded-lg border border-black/60 bg-[#242424] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-black/60 px-4 py-2">
          <h2 className="text-sm font-semibold text-neutral-100">Edit Comment</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-40 w-full resize-none rounded border border-neutral-700 bg-[#1f1f1f] px-3 py-2 font-mono text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-sky-400"
            placeholder="Add a comment..."
          />
        </div>

        <div className="border-t border-black/60 px-4 py-3">
          <div className="flex justify-between gap-2">
            <button
              onClick={() => onExpand(text)}
              className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
            >
              Expand ↗
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onSave(text);
                  onClose();
                }}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
