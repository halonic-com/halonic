/**
 * The running mark: a circle with a play triangle, outline style, in the text colour. Still, as
 * every v0.1 mark is. Used by a `running` Toast. Decoration: the words next to it say what runs.
 */
export function RunningIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.75 5.75v4.5L10.25 8z" />
    </svg>
  );
}
