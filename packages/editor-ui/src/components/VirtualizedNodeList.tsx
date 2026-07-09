import { useMemo } from "react";
import { VariableSizeList as List } from "react-window";
import type { NodeCategory, NodeDefinition } from "@visual-node/core";
import { CATEGORY_THEME } from "../canvas/categoryTheme.js";
import { CategoryIcon } from "../canvas/CategoryIcon.js";

export interface VirtualizedNodeItem {
  id: string;
  type: "header" | "node" | "functionCall";
  category?: NodeCategory;
  label: string;
  definition?: NodeDefinition;
  description?: string;
  isPlugin?: boolean;
  requirePath?: string;
  variableName?: string;
}

const ITEM_HEIGHT_HEADER = 32;
const ITEM_HEIGHT_CARD = 56;

export function VirtualizedNodeList({
  items,
  onSelect,
  disabled,
  itemHeight = ITEM_HEIGHT_CARD,
}: {
  items: VirtualizedNodeItem[];
  onSelect: (item: VirtualizedNodeItem) => void;
  disabled?: boolean;
  itemHeight?: number;
}) {
  const getItemSize = (index: number) => {
    const item = items[index];
    return item.type === "header" ? ITEM_HEIGHT_HEADER : ITEM_HEIGHT_CARD;
  };

  return (
    <List
      height={400}
      itemCount={items.length}
      itemSize={getItemSize}
      width="100%"
    >
      {({ index, style }: { index: number; style: React.CSSProperties }) => {
        const item = items[index];
        if (item.type === "header") {
          return (
            <div style={style} key={item.id} className="border-t border-neutral-700 bg-[#1f1f1f] px-3 py-2">
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {item.category && (
                  <span style={{ color: CATEGORY_THEME[item.category].accentHex }}>
                    <CategoryIcon category={item.category} className="h-3 w-3" />
                  </span>
                )}
                {item.label}
              </h4>
            </div>
          );
        }

        return (
          <div style={style} key={item.id} className="px-3 py-2">
            <button
              onClick={() => onSelect(item)}
              disabled={disabled}
              title={item.description}
              className="w-full rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1.5 text-left text-xs shadow-sm hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 font-medium text-neutral-100">
                {item.definition && item.definition.category && (
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                    style={{ backgroundColor: CATEGORY_THEME[item.definition.category].accentHex }}
                  >
                    <CategoryIcon category={item.definition.category} className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
                <span className="truncate">{item.label}</span>
                {item.isPlugin && (
                  <span className="ml-auto shrink-0 rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                    Plugin
                  </span>
                )}
              </div>
              <div className="truncate text-neutral-400">{item.description}</div>
            </button>
          </div>
        );
      }}
    </List>
  );
}
