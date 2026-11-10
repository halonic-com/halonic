/**
 * The copy mark: two overlapping sheets, outline style, in the text colour. Used by the
 * CommandBox's button, which is named "Copy command".
 */
export function CopyIcon() {
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
      <rect x="5.75" y="5.75" width="8" height="8" rx="1.5" />
      <path d="M10.25 3.75v-.5a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h.5" />
    </svg>
  );
}
