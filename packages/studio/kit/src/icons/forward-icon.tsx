/**
 * The forward mark: an arrow pointing right, outline style, in the text colour. Used by the
 * toolbar's Forward button, beside Back.
 */
export function ForwardIcon() {
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
      <path d="M3 8h10" />
      <path d="M9 4l4 4-4 4" />
    </svg>
  );
}
