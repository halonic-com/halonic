/**
 * The view-only mark: an open eye, outline style, in the text colour. Used by the ViewOnlyLine.
 * Decoration: the sentence next to it says the page is view only.
 */
export function EyeIcon() {
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
      <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}
