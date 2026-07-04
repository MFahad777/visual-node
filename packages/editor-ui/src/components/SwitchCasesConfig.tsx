import { getSwitchCases, type SwitchCase } from "../canvas/effectivePorts.js";

/**
 * The "Cases" list for a `controlFlow.switch` node's config panel — where case values are
 * actually authored, per explicit product decision: a case's match value is fully
 * user-provided (typed here as raw JS text, e.g. `42`, `"hello"`, `true`), not auto-numbered
 * on the canvas. The canvas node face still displays each case's current value as its pin
 * label (via `effectivePorts.ts`'s `computeEffectiveOutputs`) and still shows an "Add pin"-less
 * read-only pin stack — all add/remove/edit interaction lives here instead, mirroring
 * `FunctionDetailsPanel`'s Inputs list precedent (a side-panel-driven add/rename/remove flow)
 * rather than `GenericNode.tsx`'s on-canvas buttons used for AND/OR/etc.'s value inputs.
 *
 * A case's raw text is parsed loosely for display/round-tripping: typing `true`/`false`
 * stores a real boolean, a value that parses as a finite number stores a real number,
 * anything else stores the raw string as-is (so typing `hello` — unquoted — stores the
 * 5-character string "hello", NOT the quoted JS string literal `"hello"`; matching that
 * against Selection requires Selection to also resolve to the identical string). This keeps
 * the common cases (numbers, booleans, plain-word tags) friction-free while still allowing
 * an intentionally-quoted string when the value needs to be unambiguous.
 */
function parseCaseValueInput(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return raw;
}

export function SwitchCasesConfig({
  node,
  onAddCase,
  onRemoveCase,
  onUpdateCaseValue,
}: {
  node: { id: string; data?: Record<string, unknown> };
  onAddCase: (nodeId: string) => void;
  onRemoveCase: (nodeId: string, caseId: string) => void;
  onUpdateCaseValue: (nodeId: string, caseId: string, value: string | number | boolean) => void;
}) {
  const cases: SwitchCase[] = getSwitchCases(node.data);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-neutral-400">Cases</span>
      <span className="text-[11px] text-neutral-500">
        Each case's value can be a number, text, or true/false — typed exactly as it should match "Selection".
      </span>

      {cases.length === 0 && <p className="text-[11px] text-neutral-500">No cases yet.</p>}

      {cases.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5">
          <input
            type="text"
            className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
            defaultValue={String(c.value)}
            onBlur={(e) => onUpdateCaseValue(node.id, c.id, parseCaseValueInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <button
            onClick={() => onRemoveCase(node.id, c.id)}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
            title="Remove case"
          >
            ×
          </button>
        </div>
      ))}

      <button
        onClick={() => onAddCase(node.id)}
        className="self-start rounded px-2 py-1 text-xs text-sky-400 hover:bg-sky-500/10"
      >
        + Add Case
      </button>
    </div>
  );
}
