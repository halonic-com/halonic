/**
 * The Help mark: a circle with a "?", outline style, in the text colour, on the place icons' 24
 * grid and line, so it sits in the sidebar's Help row beside Settings (HAL-14964). People look
 * for a "?" for help; the circled "i" stays the info note's mark. Decoration: the row's label
 * says what it is.
 */
export function HelpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <path d="M12 17h.01" />
    </svg>
  );
}
