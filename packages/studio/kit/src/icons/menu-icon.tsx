/**
 * The menu mark: three lines, outline style, in the text colour. Used by the narrow window's
 * Places button, which opens the sidebar as a drawer (component specs 24.4).
 */
export function MenuIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 4h11" />
      <path d="M2.5 8h11" />
      <path d="M2.5 12h11" />
    </svg>
  );
}
