import type { InputHTMLAttributes } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  className?: string;
}

/**
 * Theme-matched checkbox used everywhere in place of the browser-default checkbox — a
 * visually hidden native `<input type="checkbox">` (kept for real keyboard/focus/form
 * semantics, just made invisible and stretched over the box) plus a custom box+checkmark
 * driven directly off React's `checked` prop rather than a CSS `peer-checked` selector,
 * since a `peer-checked:` class only ever applies to a *direct* sibling of the input in
 * the compiled CSS (`.peer:checked ~ .foo`) — it can't reach the nested checkmark `<svg>`.
 */
export function Checkbox({ className = "", checked, disabled, ...props }: CheckboxProps) {
  return (
    <span className={`relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500/50 ${
          checked ? "border-sky-500 bg-sky-500" : "border-neutral-600 bg-[#2a2a2a]"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <svg
          viewBox="0 0 12 12"
          fill="none"
          className={`h-2.5 w-2.5 text-white transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
        >
          <path
            d="M2.5 6.3L4.8 8.6L9.3 3.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}
