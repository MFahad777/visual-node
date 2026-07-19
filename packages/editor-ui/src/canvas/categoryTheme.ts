import type { NodeCategory } from "@visual-node/core";

export interface CategoryTheme {
  label: string;
  /** Tailwind gradient classes for a node header / legend swatch background. */
  headerClass: string;
  /** Accent color used for pin fills, wire strokes, icon strokes, and glows (inline styles, not Tailwind). */
  accentHex: string;
  /** SVG path `d` strings (24x24 viewBox, stroke-based line icon) — render via <CategoryIcon>. */
  iconPaths: string[];
}

export const CATEGORY_ORDER: NodeCategory[] = [
  "server",
  "routing",
  "middleware",
  "handler",
  "operators",
  "controlFlow",
  "logic",
  "array",
  "object",
  "error",
  "debugging",
];

export const CATEGORY_THEME: Record<NodeCategory, CategoryTheme> = {
  server: {
    label: "Server",
    headerClass: "bg-gradient-to-b from-slate-500 to-slate-700",
    accentHex: "#64748b",
    // Server rack: two stacked rounded bars with a status LED on each.
    iconPaths: [
      "M4 4h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
      "M4 14h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
      "M7 8h.01",
      "M7 18h.01",
    ],
  },
  routing: {
    label: "Routing",
    headerClass: "bg-gradient-to-b from-blue-500 to-blue-800",
    accentHex: "#3b82f6",
    // Directional flow: a line into a chevron arrowhead.
    iconPaths: ["M4 12h16", "M14 6l6 6-6 6"],
  },
  middleware: {
    label: "Middleware",
    headerClass: "bg-gradient-to-b from-amber-500 to-amber-800",
    accentHex: "#d97706",
    // Funnel: everything passes through and narrows.
    iconPaths: ["M4 5h16l-6 7v5l-4 2v-7z"],
  },
  handler: {
    label: "Handler",
    headerClass: "bg-gradient-to-b from-emerald-500 to-emerald-800",
    accentHex: "#10b981",
    // Return/reply arrow.
    iconPaths: ["M18 6v6a2 2 0 0 1-2 2H6", "M10 10l-4 4 4 4"],
  },
  operators: {
    label: "Operators",
    headerClass: "bg-gradient-to-b from-cyan-500 to-cyan-800",
    accentHex: "#06b6d4",
    // Plus/minus arithmetic glyph.
    iconPaths: ["M5 8h6", "M8 5v6", "M13 16h6"],
  },
  controlFlow: {
    label: "Control Flow",
    headerClass: "bg-gradient-to-b from-lime-500 to-lime-800",
    accentHex: "#84cc16",
    // Forking path: one line splitting into two, distinct from routing's single chevron.
    iconPaths: ["M4 12h5", "M9 12l6-6h5", "M9 12l6 6h5"],
  },
  logic: {
    label: "Logic",
    headerClass: "bg-gradient-to-b from-violet-500 to-violet-800",
    accentHex: "#8b5cf6",
    // Flowchart decision diamond.
    iconPaths: ["M12 3l9 9-9 9-9-9z"],
  },
  debugging: {
    label: "Debugging",
    headerClass: "bg-gradient-to-b from-rose-500 to-rose-800",
    accentHex: "#f43f5e",
    // Inspect/magnifying glass.
    iconPaths: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M21 21l-4.35-4.35"],
  },
  array: {
    label: "Array",
    headerClass: "bg-gradient-to-b from-gray-300 to-gray-500",
    accentHex: "#9ca3af",
    // Square brackets, evoking an array literal.
    iconPaths: ["M8 4H5v16h3", "M16 4h3v16h-3"],
  },
  object: {
    label: "Object",
    headerClass: "bg-gradient-to-b from-indigo-500 to-indigo-800",
    accentHex: "#6366f1",
    // Curly braces, evoking an object literal.
    iconPaths: ["M7 3h3v18H7", "M14 3h3v18h-3", "M5 5v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5"],
  },
  error: {
    label: "Error",
    headerClass: "bg-gradient-to-b from-red-600 to-red-900",
    accentHex: "#dc2626",
    // Warning triangle with an exclamation mark
    iconPaths: ["M12 3l9 16H3z", "M12 10v4", "M12 17h.01"],
  },
};
