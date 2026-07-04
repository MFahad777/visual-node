import { useEffect, useRef } from "react";
import { useFlowStore } from "../store/flowStore.js";
import { useResize } from "../hooks/useResize.js";
import { ResizeHandle } from "./ResizeHandle.js";

export function ServerLogPanel() {
  const isServerRunning = useFlowStore((s) => s.isServerRunning);
  const serverLogs = useFlowStore((s) => s.serverLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { size: height, onMouseDown } = useResize({ initial: 160, min: 80, max: 500, axis: "y", invert: true });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [serverLogs]);

  if (!isServerRunning && serverLogs.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col" style={{ height }}>
      <ResizeHandle axis="y" onMouseDown={onMouseDown} />
      <div className="flex flex-1 flex-col overflow-hidden border-t border-black/60 bg-[#161616]">
        <div className="flex items-center gap-2 border-b border-black/60 px-3 py-1">
          <span
            className={`h-2 w-2 rounded-full ${isServerRunning ? "bg-green-500" : "bg-neutral-600"}`}
            title={isServerRunning ? "Running" : "Stopped"}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Server Logs</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-5 text-neutral-300">
          {serverLogs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
