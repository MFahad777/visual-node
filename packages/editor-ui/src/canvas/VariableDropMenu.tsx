import { useEffect, useRef } from "react";
import type { VariableDeclaration } from "@flowserver/core";

export interface VariableDropMenuProps {
  variableName: string;
  variableKeyword: VariableDeclaration["keyword"];
  x: number;
  y: number;
  onChoose: (kind: "get" | "set") => void;
  onClose: () => void;
}

const MENU_WIDTH = 170;
const MENU_MAX_HEIGHT = 90;

/**
 * Small drop-to-choose popup shown when a Variables-panel row (`VariablesPanel.tsx`) is
 * dragged onto a canvas — offers "Get <name>"/"Set <name>", reusing `NodePickerMenu.tsx`'s
 * dark-theme popup shell (viewport-clamped fixed positioning, border/shadow classes,
 * click-outside-via-pointerdown + Escape dismissal) without any of its search/catalog
 * logic, since this menu only ever has up to two fixed options.
 */
export function VariableDropMenu({ variableName, variableKeyword, x, y, onChoose, onClose }: VariableDropMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
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
      <button
        onClick={() => onChoose("get")}
        className="px-2.5 py-1.5 text-left text-xs text-neutral-100 hover:bg-neutral-700"
      >
        Get {variableName}
      </button>
      {/* A `const` can never be reassigned — omitting "Set" here avoids offering an
          obviously-invalid choice; core-side validation remains the enforced safety net. */}
      {variableKeyword !== "const" && (
        <button
          onClick={() => onChoose("set")}
          className="px-2.5 py-1.5 text-left text-xs text-neutral-100 hover:bg-neutral-700"
        >
          Set {variableName}
        </button>
      )}
    </div>
  );
}
