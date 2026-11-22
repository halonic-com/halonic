/**
 * The approval hand: an open raised palm, four fingers and the thumb, outline style, in the text
 * colour, on the place icons' 24 grid and line. The agent map's connector card puts it before
 * "1 tool asks first" (flow-agents 6, Noah's N1), in place of the ✋ emoji, which draws in its own
 * colours, differs per system and is a blank gap without an emoji font (C606). Decoration: the
 * words next to it say what asks first.
 */
export function HandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 14.5V6a1.5 1.5 0 0 1 3 0v5" />
      <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 11V6a1.5 1.5 0 0 1 3 0v5" />
      <path d="M17 10.5V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2l-3.4-4.1a1.5 1.5 0 0 1 2.3-1.9L8 14.5" />
    </svg>
  );
}
