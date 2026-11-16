/**
 * The shield: an outline in the text colour, for the line under a sandboxed step. Decoration: the
 * words next to it say what the sandbox does.
 */
export function ShieldIcon() {
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
      <path d="M8 1.75 2.75 3.5v4c0 3 2.1 5.2 5.25 6.75 3.15-1.55 5.25-3.75 5.25-6.75v-4Z" />
    </svg>
  );
}
