import { useEffect, useRef } from "react";
import type { FunctionUsage } from "./effectivePorts.js";

export interface FunctionUsageMenuProps {
  x: number;
  y: number;
  onChoose: (usage: FunctionUsage) => void;
  onClose: () => void;
}

const MENU_WIDTH = 190;
const MENU_MAX_HEIGHT = 100;

/**
 * Small popup shown whenever a `logic.function` ("Function") node is added — from the
 * right-click canvas picker, the Browse Nodes modal, or dragging a Function card onto the
 * canvas — deciding which pins the new node gets (see `effectivePorts.ts`'s
 * `functionAllowedInputHandles`/`functionAllowedOutputHandles`). Structurally copied from
 * `VariableDropMenu.tsx`'s popup shell (viewport-clamped fixed positioning, click-outside-
 * via-pointerdown + Escape dismissal) since this is the same "small drop-to-choose" shape.
 */
export function FunctionUsageMenu({ x, y, onChoose, onClose }: FunctionUsageMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - MENU_MAX_HEIGHT - 8));

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", left, top, width: MENU_WIDTH }}
      className="z-50 flex flex-col overflow-hidden rounded-lg border border-black/60 bg-[#1f1f1f] shadow-2xl shadow-black/60"
    >
      <div className="border-b border-black/60 px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-neutral-400">
        Use Function As
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onChoose("callback")}
        className="px-2.5 py-1.5 text-left text-xs text-neutral-100 hover:bg-neutral-700"
        title="No execution pin on either side — assign it to a variable or pass it into a Callback node."
      >
        For Calling / Callback
      </button>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onChoose("standalone")}
        className="px-2.5 py-1.5 text-left text-xs text-neutral-100 hover:bg-neutral-700"
        title="Ordinary declared function, wireable into Export — no value-assign pin."
      >
        Standalone Function
      </button>
    </div>
  );
}
