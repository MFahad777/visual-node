import { lazy, Suspense } from "react";

const JsCodeFieldImpl = lazy(() => import("./JsCodeFieldImpl.js"));

export function LazyJsCodeField({
  value,
  onChange,
  onExpand,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  onExpand?: () => void;
}) {
  return (
    <Suspense fallback={<div className="h-[140px] rounded border border-neutral-700 bg-neutral-900" />}>
      <JsCodeFieldImpl value={value} onChange={onChange} onExpand={onExpand} />
    </Suspense>
  );
}
