import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
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

export default function JsCodeField({
  value,
  onChange,
  onExpand,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  onExpand?: () => void;
}) {
  return (
    <div>
      {onExpand && (
        <div className="mb-0.5 flex justify-end">
          <ExpandButton onExpand={onExpand} />
        </div>
      )}
      <div className="overflow-hidden rounded border border-neutral-700">
        <CodeMirror
          value={String(value ?? "")}
          theme={CODE_MIRROR_THEME}
          height="140px"
          extensions={[javascript()]}
          basicSetup={CODE_MIRROR_BASIC_SETUP}
          onChange={(next) => onChange(next)}
        />
      </div>
    </div>
  );
}
