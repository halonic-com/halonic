/**
 * The info mark: a circle with an "i", outline style, in the text colour. Used by an `info`
 * Callout. Decoration: the words next to it say what it's about.
 */
export function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.75" />
      <path d="M8 4.75h.01" />
    </svg>
  );
}
