import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import type { VariableDataType } from "@visual-node/core";
import { CODE_MIRROR_THEME, CODE_MIRROR_BASIC_SETUP } from "./codeEditorShared.js";

/**
 * Code-only editor for object/array/map/set/weakset variable defaults.
 * Provides a CodeMirror JS editor for raw-text authoring with fullscreen expand option.
 */
export default function ComplexDefaultValueEditor({
  dataType,
  value,
  onChange,
}: {
  dataType: VariableDataType;
  value: string;
  onChange: (value: string) => void;
}) {
  const [codeValue, setCodeValue] = useState(value);
  const [expandedOpen, setExpandedOpen] = useState(false);

  function handleCodeChange(text: string) {
    setCodeValue(text);
  }

  function handleCodeBlur() {
    onChange(codeValue);
  }

  function handleExpandedBlur() {
    onChange(codeValue);
    setExpandedOpen(false);
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1 items-start">
          <div className="flex-1 overflow-hidden rounded border border-neutral-700">
            <CodeMirror
              value={codeValue}
              onChange={handleCodeChange}
              onBlur={handleCodeBlur}
              theme={CODE_MIRROR_THEME}
              height="120px"
              extensions={[javascript()]}
              basicSetup={CODE_MIRROR_BASIC_SETUP}
            />
          </div>
          <button
            onClick={() => setExpandedOpen(true)}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-neutral-600 text-xs text-neutral-400 hover:border-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
            title="Expand to fullscreen"
          >
            ⛶
          </button>
        </div>
        <div className="text-[10px] text-neutral-500 italic px-1">
          {dataType === "object"
            ? "JS object: {key: value, fn: function(x){ return x; }}"
            : dataType === "map"
              ? "JSON array of [key, value] pairs: [[\"a\", 1], [\"b\", 2]]"
              : `JSON array: [value1, value2, ...]`}
        </div>
      </div>

      {/* Fullscreen expand modal */}
      {expandedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex h-[90vh] w-[90vw] flex-col rounded-lg bg-neutral-800 shadow-lg">
            <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
              <h2 className="text-sm font-semibold text-neutral-100">
                {dataType === "object"
                  ? "Edit Object Default"
                  : dataType === "map"
                    ? "Edit Map Default"
                    : dataType === "set"
                      ? "Edit Set Default"
                      : dataType === "weakset"
                        ? "Edit WeakSet Default"
                        : "Edit Array Default"}
              </h2>
              <button
                onClick={() => {
                  handleExpandedBlur();
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
                title="Close (Ctrl+S to save)"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CodeMirror
                value={codeValue}
                onChange={handleCodeChange}
                onBlur={handleExpandedBlur}
                theme={CODE_MIRROR_THEME}
                height="100%"
                extensions={[javascript()]}
                basicSetup={CODE_MIRROR_BASIC_SETUP}
              />
            </div>
            <div className="border-t border-neutral-700 px-4 py-3 text-[11px] text-neutral-400">
              {dataType === "object"
                ? "JS object: {key: value, fn: function(x){ return x; }}"
                : dataType === "map"
                  ? "JSON array of [key, value] pairs: [[\"a\", 1], [\"b\", 2]]"
                  : `JSON array: [value1, value2, ...]`}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
