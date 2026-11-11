/**
 * The refresh mark: a circle arrow turning clockwise, outline style, in the text colour. Used by a
 * plugin card's ↻, whose label says what it refreshes ("Refresh Today's weather").
 */
export function RefreshIcon() {
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
      <path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71" />
      <path d="M12 1.75v2.75H9.25" />
    </svg>
  );
}
