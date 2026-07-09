import { lazy, Suspense } from "react";
import type { ConfigField } from "@visual-node/core";

const JsonCodeFieldImpl = lazy(() => import("./JsonCodeFieldImpl.js"));

export function LazyJsonCodeField({
  field,
  value,
  onChange,
  onExpand,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  onExpand?: () => void;
}) {
  return (
    <Suspense fallback={<div className="h-[140px] rounded border border-neutral-700 bg-neutral-900" />}>
      <JsonCodeFieldImpl field={field} value={value} onChange={onChange} onExpand={onExpand} />
    </Suspense>
  );
}
