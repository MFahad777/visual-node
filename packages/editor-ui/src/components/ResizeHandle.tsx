interface ResizeHandleProps {
  axis: "x" | "y";
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeHandle({ axis, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={
        axis === "x"
          ? "w-1 shrink-0 cursor-col-resize bg-black/60 hover:bg-sky-500/70 active:bg-sky-500/70"
          : "h-1 shrink-0 cursor-row-resize bg-black/60 hover:bg-sky-500/70 active:bg-sky-500/70"
      }
    />
  );
}
