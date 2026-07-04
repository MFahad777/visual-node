import { useCallback, useRef, useState } from "react";

interface UseResizeOptions {
  initial: number;
  min: number;
  max: number;
  axis: "x" | "y";
  /** Set true when the drag handle sits on the leading edge (left/top) of the panel,
   * so moving the mouse toward the handle's outer side grows the panel. */
  invert?: boolean;
}

export function useResize({ initial, min, max, axis, invert = false }: UseResizeOptions) {
  const [size, setSize] = useState(initial);
  const sizeRef = useRef(initial);
  sizeRef.current = size;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const start = axis === "x" ? e.clientX : e.clientY;
      const startSize = sizeRef.current;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const current = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
        const delta = current - start;
        const signedDelta = invert ? -delta : delta;
        setSize(Math.min(max, Math.max(min, startSize + signedDelta)));
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [axis, invert, min, max],
  );

  return { size, onMouseDown };
}
