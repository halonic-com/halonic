/**
 * The back mark: an arrow pointing left, outline style, in the text colour. Used by the Back
 * button of a Side panel shown as a sheet, whose label says "Back", and the toolbar's Back.
 */
export function BackIcon() {
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
      <path d="M13 8H3" />
      <path d="M7 4L3 8l4 4" />
    </svg>
  );
}
