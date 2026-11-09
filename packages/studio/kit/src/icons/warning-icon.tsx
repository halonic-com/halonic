/**
 * The warning mark: a triangle with an exclamation point, outline style, in the text colour.
 * Used by a `warning` Callout. Decoration: the words next to it say what's wrong.
 */
export function WarningIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5Z" />
      <path d="M8 6.25v3" />
      <path d="M8 11.25h.01" />
    </svg>
  );
}
