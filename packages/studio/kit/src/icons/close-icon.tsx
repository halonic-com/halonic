/**
 * The close mark: a ✕, outline style, in the text colour. Used by a Dialog's close button and a
 * window tab's, whose label says what it closes.
 */
export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </svg>
  );
}
