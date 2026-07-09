import { useState } from "react";
import { Panel } from "@xyflow/react";
import { CATEGORY_ORDER, CATEGORY_THEME } from "./categoryTheme.js";
import { CategoryIcon } from "./CategoryIcon.js";

export function CategoryLegend() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Panel position="top-right" className="!m-3">
      {expanded ? (
        <div className="w-40 rounded-lg border border-black/60 bg-[#1f1f1f] p-2.5 text-neutral-100 shadow-lg shadow-black/50">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Legend</span>
            <button
              onClick={() => setExpanded(false)}
              className="text-[11px] text-neutral-400 hover:text-neutral-300"
              aria-label="Collapse legend"
            >
              ▴
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {CATEGORY_ORDER.map((category) => {
              const theme = CATEGORY_THEME[category];
              return (
                <div key={category} className="flex items-center gap-1.5">
                  <span style={{ color: theme.accentHex }}>
                    <CategoryIcon category={category} className="h-3 w-3" />
                  </span>
                  <span className="text-[11px] text-neutral-300">{theme.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="rounded-lg border border-black/60 bg-[#1f1f1f] px-2.5 py-1 text-[11px] font-medium text-neutral-300 shadow-lg shadow-black/50 hover:text-neutral-100"
        >
          Legend ▾
        </button>
      )}
    </Panel>
  );
}
