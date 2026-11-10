/**
 * The search mark: a lens with its handle, outline style, in the text colour. Used by the Ctrl K
 * palette's search row and the sidebar's search box (component specs 24.3, 24.4).
 */
export function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 13.5 13.5" />
    </svg>
  );
}
