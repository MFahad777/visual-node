import type { NodeCategory } from "@visual-node/core";
import { CATEGORY_THEME } from "./categoryTheme.js";

export interface CategoryIconProps {
  category: NodeCategory;
  className?: string;
}

/** Small stroke-based line icon for a node category, rendered from `categoryTheme.ts`'s `iconPaths`. */
export function CategoryIcon({ category, className = "h-3.5 w-3.5" }: CategoryIconProps) {
  const theme = CATEGORY_THEME[category];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {theme.iconPaths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
