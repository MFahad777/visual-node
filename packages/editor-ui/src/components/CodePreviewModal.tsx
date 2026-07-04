import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { useFlowStore, selectIsCompileStale } from "../store/flowStore.js";

export function CodePreviewModal() {
  const isPreviewOpen = useFlowStore((s) => s.isPreviewOpen);
  const compiledResults = useFlowStore((s) => s.compiledResults);
  const compileErrors = useFlowStore((s) => s.compileErrors);
  const selectedPreviewFile = useFlowStore((s) => s.selectedPreviewFile);
  const isCompileStale = useFlowStore(selectIsCompileStale);
  const isWritingAll = useFlowStore((s) => s.isWritingAll);
  const lastWrittenFiles = useFlowStore((s) => s.lastWrittenFiles);
  const lastError = useFlowStore((s) => s.lastError);
  const closePreview = useFlowStore((s) => s.closePreview);
  const writeProjectToDisk = useFlowStore((s) => s.writeProjectToDisk);
  const selectPreviewFile = useFlowStore((s) => s.selectPreviewFile);

  const [confirming, setConfirming] = useState(false);

  if (!isPreviewOpen || compiledResults === null) return null;

  const activeFile = compiledResults.find((r) => r.relativePath === selectedPreviewFile);
  const code = activeFile?.code ?? "";
  const errorPaths = new Set(compileErrors.map((e) => e.relativePath));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-[920px] flex-col rounded-lg border border-black/60 bg-[#242424] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-black/60 px-4 py-2">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">
              Compiled Project ({compiledResults.length} files)
            </h2>
          </div>
          <button onClick={closePreview} className="text-neutral-500 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-52 shrink-0 overflow-y-auto border-r border-black/60 bg-[#1f1f1f] py-1">
            {compiledResults.map((file) => (
              <button
                key={file.relativePath}
                onClick={() => selectPreviewFile(file.relativePath)}
                className={`flex w-full items-center justify-between gap-1 px-3 py-1.5 text-left text-xs hover:bg-neutral-700 ${
                  file.relativePath === selectedPreviewFile
                    ? "bg-neutral-700 text-neutral-100"
                    : "text-neutral-300"
                }`}
                title={file.relativePath}
              >
                <span className="truncate">{file.relativePath}</span>
                {errorPaths.has(file.relativePath) && (
                  <span className="shrink-0 text-red-400" title="Has compile errors">
                    ⚠
                  </span>
                )}
              </button>
            ))}
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
              <button
                onClick={() => setConfirming(true)}
                disabled={isCompileStale}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Write All to Disk
              </button>
            ) : (
              <>
                <span className="self-center text-xs text-neutral-400">
                  This will overwrite existing files on disk. Confirm?
                </span>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const ok = await writeProjectToDisk();
                    if (ok) setConfirming(false);
                  }}
                  disabled={isWritingAll}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isWritingAll ? "Writing…" : "Confirm"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
