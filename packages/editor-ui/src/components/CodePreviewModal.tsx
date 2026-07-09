import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { useFlowStore, selectIsCompileStale } from "../store/flowStore.js";
import { Checkbox } from "./Checkbox.js";

export function CodePreviewModal() {
  const isPreviewOpen = useFlowStore((s) => s.isPreviewOpen);
  const compiledResults = useFlowStore((s) => s.compiledResults);
  const compileErrors = useFlowStore((s) => s.compileErrors);
  const selectedPreviewFile = useFlowStore((s) => s.selectedPreviewFile);
  const checkedPreviewFiles = useFlowStore((s) => s.checkedPreviewFiles);
  const isCompileStale = useFlowStore(selectIsCompileStale);
  const isWritingAll = useFlowStore((s) => s.isWritingAll);
  const isWritingChecked = useFlowStore((s) => s.isWritingChecked);
  const lastWrittenFiles = useFlowStore((s) => s.lastWrittenFiles);
  const lastError = useFlowStore((s) => s.lastError);
  const closePreview = useFlowStore((s) => s.closePreview);
  const writeProjectToDisk = useFlowStore((s) => s.writeProjectToDisk);
  const writeCheckedFilesToDisk = useFlowStore((s) => s.writeCheckedFilesToDisk);
  const toggleCheckedPreviewFile = useFlowStore((s) => s.toggleCheckedPreviewFile);
  const setAllCheckedPreviewFiles = useFlowStore((s) => s.setAllCheckedPreviewFiles);
  const selectPreviewFile = useFlowStore((s) => s.selectPreviewFile);

  // Which write action ("all" or "checked") the confirm bar is currently asking about —
  // the two buttons share one confirm/cancel row rather than each growing their own.
  const [confirming, setConfirming] = useState<"all" | "checked" | null>(null);

  if (!isPreviewOpen || compiledResults === null) return null;

  const activeFile = compiledResults.find((r) => r.relativePath === selectedPreviewFile);
  const code = activeFile?.code ?? "";
  const errorPaths = new Set(compileErrors.map((e) => e.relativePath));
  const allChecked = compiledResults.length > 0 && checkedPreviewFiles.size === compiledResults.length;
  const checkedCount = checkedPreviewFiles.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[80vh] w-[920px] flex-col rounded-lg border border-black/60 bg-[#242424] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-black/60 px-4 py-2">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">
              Compiled Project ({compiledResults.length} files)
            </h2>
          </div>
          <button onClick={closePreview} className="text-neutral-400 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-64 shrink-0 flex-col border-r border-black/60 bg-[#1f1f1f]">
            <label className="flex items-center gap-2 border-b border-black/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 hover:text-neutral-300">
              <Checkbox checked={allChecked} onChange={(e) => setAllCheckedPreviewFiles(e.target.checked)} />
              Select All
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {compiledResults.map((file) => (
                <div
                  key={file.relativePath}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-700 ${
                    file.relativePath === selectedPreviewFile ? "bg-neutral-700 text-neutral-100" : "text-neutral-300"
                  }`}
                >
                  <Checkbox
                    checked={checkedPreviewFiles.has(file.relativePath)}
                    onChange={() => toggleCheckedPreviewFile(file.relativePath)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={() => selectPreviewFile(file.relativePath)}
                    title={file.relativePath}
                    className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left"
                  >
                    <span className="truncate">{file.relativePath}</span>
                    {errorPaths.has(file.relativePath) && (
                      <span className="shrink-0 text-red-400" title="Has compile errors">
                        ⚠
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2">
            <Highlight theme={themes.vsDark} code={code} language="javascript">
              {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <pre className={`${className} rounded p-3 text-xs`} style={style}>
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          </div>
        </div>

        <div className="border-t border-black/60 px-4 py-3">
          {isCompileStale && (
            <p className="mb-2 text-xs text-amber-400">
              Project files changed since last compile — click Compile again before writing.
            </p>
          )}
          {lastWrittenFiles && !confirming && (
            <div className="mb-2 text-xs text-green-400">
              <p>Written {lastWrittenFiles.length} file(s):</p>
              <ul className="ml-3 list-disc">
                {lastWrittenFiles.map((f) => (
                  <li key={f.relativePath}>{f.outputPath}</li>
                ))}
              </ul>
            </div>
          )}
          {lastError && <p className="mb-2 text-xs text-red-400">{lastError}</p>}

          <div className="flex justify-end gap-2">
            <button
              onClick={closePreview}
              className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
            >
              Close
            </button>

            {!confirming ? (
              <>
                <button
                  onClick={() => setConfirming("checked")}
                  disabled={isCompileStale || checkedCount === 0}
                  className="rounded border border-blue-600 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-600/10 disabled:opacity-50"
                >
                  Write Selected Files to Disk{checkedCount > 0 ? ` (${checkedCount})` : ""}
                </button>
                <button
                  onClick={() => setConfirming("all")}
                  disabled={isCompileStale}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Write All to Disk
                </button>
              </>
            ) : (
              <>
                <span className="self-center text-xs text-neutral-400">
                  {confirming === "all"
                    ? "This will overwrite existing files on disk. Confirm?"
                    : `This will overwrite ${checkedCount} selected file(s) on disk. Confirm?`}
                </span>
                <button
                  onClick={() => setConfirming(null)}
                  className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const ok = confirming === "all" ? await writeProjectToDisk() : await writeCheckedFilesToDisk();
                    if (ok) setConfirming(null);
                  }}
                  disabled={isWritingAll || isWritingChecked}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isWritingAll || isWritingChecked ? "Writing…" : "Confirm"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
