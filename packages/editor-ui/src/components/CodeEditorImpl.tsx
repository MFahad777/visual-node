import CodeMirror from "@uiw/react-codemirror";
import type { ConfigField } from "@visual-node/core";
import { CODE_MIRROR_BASIC_SETUP, CODE_MIRROR_THEME, extensionsForField } from "./codeEditorShared.js";

export default function CodeEditor({
  value,
  field,
  onChange,
  height = "100px",
}: {
  value: unknown;
  field: ConfigField;
  onChange: (value: unknown) => void;
  height?: string;
}) {
  return (
    <div className="overflow-hidden rounded border border-neutral-700">
      <CodeMirror
        value={String(value ?? "")}
        theme={CODE_MIRROR_THEME}
        height={height}
        extensions={extensionsForField(field)}
        basicSetup={CODE_MIRROR_BASIC_SETUP}
        onChange={onChange}
      />
    </div>
  );
}
