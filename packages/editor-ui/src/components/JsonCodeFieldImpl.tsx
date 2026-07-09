import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import type { ConfigField } from "@visual-node/core";
import { CODE_MIRROR_BASIC_SETUP, CODE_MIRROR_THEME } from "./codeEditorShared.js";

function ExpandButton({ onExpand }: { onExpand: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      className="cursor-pointer rounded px-1 text-xs text-neutral-400 hover:text-neutral-200"
      title="Expand"
    >
      ⤢
    </span>
  );
}

export default function JsonCodeField({
  field,
  value,
  onChange,
  onExpand,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  onExpand?: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? field.default, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value ?? field.default, null, 2));
    setError(null);
  }, [value, field.default]);

  return (
    <div>
      {onExpand && (
        <div className="mb-0.5 flex justify-end">
          <ExpandButton onExpand={onExpand} />
        </div>
      )}
      <div className={`overflow-hidden rounded border ${error ? "border-red-500" : "border-neutral-700"}`}>
        <CodeMirror
          value={text}
          theme={CODE_MIRROR_THEME}
          height="140px"
          extensions={[json()]}
          basicSetup={CODE_MIRROR_BASIC_SETUP}
          onChange={(next) => {
            setText(next);
            try {
              const parsed = JSON.parse(next);
              setError(null);
              onChange(parsed);
            } catch {
              setError("Invalid JSON");
            }
          }}
        />
      </div>
      {error && <div className="mt-0.5 text-[11px] text-red-400">{error}</div>}
    </div>
  );
}
