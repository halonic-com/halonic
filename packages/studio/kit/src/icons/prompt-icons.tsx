/** An arrow pointing up, outline style, in the text colour. Used by a chat's round Send. */
export function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 13V3M8 3 3.5 7.5M8 3l4.5 4.5" />
    </svg>
  );
}

/** A filled square, in the text colour. Used by a chat's round Stop while a reply is written. */
export function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" />
    </svg>
  );
}
