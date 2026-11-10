/**
 * The "not decided yet" mark: a dashed circle, outline style, in the text colour. Used by the
 * trust badge. Decoration: the words next to it say what isn't decided.
 */
export function DashedRingIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="2.5 2"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.75" />
    </svg>
  );
}
