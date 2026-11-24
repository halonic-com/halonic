/**
 * The open-as-tab mark ⧉: two overlapping squares, the front one lower left, outline style, in
 * the text colour. Used by the Assistant panel's Open as tab button (`assistant.chat.open-as-tab`).
 */
export function OpenAsTabIcon() {
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
      <rect x="2.25" y="5.75" width="8" height="8" rx="1.5" />
      <path d="M5.75 4.25v-.5a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-.5" />
    </svg>
  );
}
