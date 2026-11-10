/**
 * The success mark: a circle with a tick, outline style, in the text colour. Used by a `success`
 * Toast. Decoration: the words next to it say what happened.
 */
export function CheckIcon() {
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
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.5 8.25l1.75 1.75 3.25-3.5" />
    </svg>
  );
}
