export interface CommentIconProps {
  className?: string;
}

/** Small stroke-based speech-bubble icon for the node comment bubble, matching
 * `CategoryIcon.tsx`'s hand-drawn SVG style (Phase 5's emoji-to-SVG precedent). */
export function CommentIcon({ className = "h-3.5 w-3.5" }: CommentIconProps) {
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
      <path d="M4 5h16v11H8l-4 4V5z" />
      <path d="M8 9.5h8" />
      <path d="M8 13h5" />
    </svg>
  );
}
