import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const ITEM_HEIGHT_HEADER_DEFAULT = 36;
const ITEM_HEIGHT_CARD_DEFAULT = 68;

function CategoryIconSwatch({ category }: { category: NodeCategory }) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
      style={{ backgroundColor: CATEGORY_THEME[category].accentHex }}
    >
      <CategoryIcon category={category} className="h-2.5 w-2.5 text-white" />
    </span>
  );
}

export function VirtualizedNodeList({
  items,
  onSelect,
  disabled,
}: {
  items: VirtualizedNodeItem[];
  onSelect: (item: VirtualizedNodeItem) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const itemHeightsRef = useRef<Map<string, number>>(new Map());

  // Measured from the real wrapping element rather than hardcoded, since this list is
  // rendered inside two containers with different, dynamic available heights (the
  // right-click NodePickerMenu's flex box and the NodeBrowserModal's flex-1 region) — a
  // fixed height here previously either clipped or left dead space depending on caller.
  // Start with 400 as a sensible default; ResizeObserver will update it to the actual measured height.
  const [height, setHeight] = useState(400);

  // Ongoing height updates as container resizes (window resize, panel toggle, etc.).
  // ResizeObserver fires after layout is calculated, correcting any initial mismatch between
  // the 400px default and the real available space.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.height > 0) {
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset item height cache when items change
  useEffect(() => {
    itemHeightsRef.current.clear();
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [items]);

  const setItemHeight = (index: number, size: number) => {
    const item = items[index];
    const cachedHeight = itemHeightsRef.current.get(item.id);
    if (cachedHeight === size) return;

    itemHeightsRef.current.set(item.id, size);
    if (listRef.current) {
      listRef.current.resetAfterIndex(index);
    }
  };

  const getItemSize = (index: number) => {
    const item = items[index];
    const cached = itemHeightsRef.current.get(item.id);
    if (cached) return cached;

    // Return reasonable defaults while measuring
    return item.type === "header" ? ITEM_HEIGHT_HEADER_DEFAULT : ITEM_HEIGHT_CARD_DEFAULT;
  };

  return (
    <div ref={containerRef} className="h-full w-full">
      <List
        ref={listRef}
        height={height}
        itemCount={items.length}
        itemSize={getItemSize}
        width="100%"
      >
        {({ index, style }: { index: number; style: React.CSSProperties }) => {
          const item = items[index];
          if (item.type === "header") {
            return (
              <div
                ref={(el) => {
                  if (el) {
                    const contentHeight = el.scrollHeight;
                    setItemHeight(index, contentHeight);
                  }
                }}
                style={style}
                key={item.id}
                className="border-t border-neutral-700 bg-[#1f1f1f] px-3 py-2"
              >
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {item.category && <CategoryIconSwatch category={item.category} />}
                  {item.label}
                </h4>
              </div>
            );
          }

          return (
            <div
              ref={(el) => {
                if (el) {
                  const contentHeight = el.scrollHeight;
                  setItemHeight(index, contentHeight);
                }
              }}
              style={style}
              key={item.id}
              className="px-3 py-2.5"
            >
              <button
                onClick={() => onSelect(item)}
                disabled={disabled}
                title={item.description}
                className="w-full rounded border border-neutral-700 bg-[#2a2a2a] px-3 py-2 text-left text-xs shadow-sm hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 font-medium text-neutral-100">
                  {item.definition && item.definition.category && (
                    <CategoryIconSwatch category={item.definition.category} />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.isPlugin && (
                    <span className="ml-auto shrink-0 rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                      Plugin
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-neutral-400">{item.description}</div>
              </button>
            </div>
          );
        }}
      </List>
    </div>
  );
}
