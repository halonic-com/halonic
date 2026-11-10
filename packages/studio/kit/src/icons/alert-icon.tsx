/**
 * The alert mark: a circle with an exclamation point, outline style, in the text colour. Used by
 * a Field's error line and the Studio's save note. Decoration: the words next to it say what's
 * wrong.
 */
export function AlertIcon() {
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
      <path d="M8 4.75v3.75" />
      <path d="M8 11.25h.01" />
    </svg>
  );
}
