/**
 * The maximise mark ⤢: two arrows pointing out to opposite corners, outline style, in the text
 * colour. Used by the side panel's Maximise button (`shell.panel-maximise`, from req-shell
 * `panels.maximise`).
 */
export function MaximiseIcon() {
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
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5 9 7" />
      <path d="M6.5 13.5h-4v-4" />
      <path d="M2.5 13.5 7 9" />
    </svg>
  );
}
