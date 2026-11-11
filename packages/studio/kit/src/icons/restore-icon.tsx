/**
 * The restore mark ⤡: two arrows pointing in from opposite corners, outline style, in the text
 * colour. Used by a maximised side panel's button that puts it back in its place
 * (req-shell `panels.maximise`).
 */
export function RestoreIcon() {
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
      <path d="M13.5 2.5 9 7" />
      <path d="M9 3.5V7h3.5" />
      <path d="M2.5 13.5 7 9" />
      <path d="M7 12.5V9H3.5" />
    </svg>
  );
}
