import { useFlowStore } from "../store/flowStore.js";
import { useResize } from "../hooks/useResize.js";
import { navigateToDiagnostic } from "../store/diagnosticNavigation.js";
import { ResizeHandle } from "./ResizeHandle.js";
import type { ValidationError } from "../api/client.js";

interface DiagnosticRowProps {
  diag: ValidationError;
  relativePath?: string;
  onNavigate: () => void;
}

function DiagnosticRow({ diag, relativePath, onNavigate }: DiagnosticRowProps) {
  const icon = diag.severity === "error" ? "⊗" : "▲";
  const color = diag.severity === "error" ? "text-red-400" : "text-amber-400";
  const breadcrumb = [relativePath, ...diag.path.map((f) => f.label)]
    .filter(Boolean)
    .join(" › ");

  return (
    <button
      onClick={onNavigate}
      className={`block w-full whitespace-pre-wrap py-0.5 text-left ${color} hover:bg-white/5`}
    >
      <span className={color}>{icon}</span>
      {breadcrumb && <span className="text-neutral-400"> {breadcrumb}: </span>}
      {diag.message}
    </button>
  );
}

export function ErrorLogPanel() {
  const isErrorLogOpen = useFlowStore((s) => s.isErrorLogOpen);
  const validationErrors = useFlowStore((s) => s.validationErrors);
  const compileErrors = useFlowStore((s) => s.compileErrors);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const closeErrorLog = useFlowStore((s) => s.closeErrorLog);
  const { size: height, onMouseDown } = useResize({ initial: 192, min: 80, max: 500, axis: "y", invert: true });

  if (!isErrorLogOpen) return null;

  const totalCount = validationErrors.length + compileErrors.length;

  return (
    <div className="flex shrink-0 flex-col" style={{ height }}>
      <ResizeHandle axis="y" onMouseDown={onMouseDown} />
      <div className="flex flex-1 flex-col overflow-hidden border-t border-black/60 bg-[#161616]">
        <div className="flex items-center gap-2 border-b border-black/60 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Problems {totalCount > 0 && `(${totalCount})`}
          </span>
          <button onClick={closeErrorLog} className="ml-auto text-neutral-400 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-5">
          {totalCount === 0 && <div className="text-neutral-400">No problems found.</div>}

          {compileErrors.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 text-neutral-400">Compile errors (last "Compile" run):</div>
              {compileErrors.map((err, i) => (
                <DiagnosticRow
                  key={i}
                  diag={err}
                  relativePath={err.relativePath}
                  onNavigate={() => navigateToDiagnostic({ ...err, relativePath: err.relativePath })}
                />
              ))}
            </div>
          )}

          {validationErrors.length > 0 && (
            <div>
              <div className="mb-1 text-neutral-400">
                Validation errors in {currentFilePath ?? "the current file"}:
              </div>
              {validationErrors.map((err, i) => (
                <DiagnosticRow
                  key={i}
                  diag={err}
                  relativePath={currentFilePath ?? undefined}
                  onNavigate={() => navigateToDiagnostic({ ...err, relativePath: currentFilePath ?? undefined })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
