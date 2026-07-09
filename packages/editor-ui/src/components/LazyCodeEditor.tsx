import { lazy, Suspense } from "react";
import type { ConfigField } from "@visual-node/core";

const CodeEditorImpl = lazy(() => import("./CodeEditorImpl.js"));

export function LazyCodeEditor({
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
    <Suspense fallback={<div className="h-[100px] rounded border border-neutral-700 bg-neutral-900" />}>
      <CodeEditorImpl value={value} field={field} onChange={onChange} height={height} />
    </Suspense>
  );
}
