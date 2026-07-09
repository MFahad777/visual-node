import { lazy, Suspense } from "react";
import type { VariableDataType } from "@visual-node/core";

const ComplexDefaultValueEditorImpl = lazy(() => import("./ComplexDefaultValueEditorImpl.js"));

export function LazyComplexDefaultValueEditor({
  dataType,
  value,
  onChange,
}: {
  dataType: VariableDataType;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Suspense fallback={<div className="h-[120px] rounded border border-neutral-700 bg-neutral-900" />}>
      <ComplexDefaultValueEditorImpl dataType={dataType} value={value} onChange={onChange} />
    </Suspense>
  );
}
