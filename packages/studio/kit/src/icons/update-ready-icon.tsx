/**
 * The update-ready mark: an arrow pointing up inside a circle, outline style, in the text colour.
 * The status bar's "Restart to update" item puts it before its words. It is not the text
 * character ↑, so it can't be mistaken for git's "main ↑2" beside it.
 */
export function UpdateReadyIcon() {
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
      <path d="M8 11V5.25" />
      <path d="M5.5 7.5L8 5l2.5 2.5" />
    </svg>
  );
}
