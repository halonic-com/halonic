/**
 * The Wi-Fi mark: three arcs over a dot, outline style, in the text colour. Used before a line
 * about the phone's connection, such as the phone's offline Inbox card. Decoration: the words next
 * to it say what it's about.
 */
export function WifiIcon() {
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
      <path d="M1.75 6a9 9 0 0 1 12.5 0" />
      <path d="M3.9 8.4a6 6 0 0 1 8.2 0" />
      <path d="M6 10.75a3 3 0 0 1 4 0" />
      <path d="M8 13.25h.01" />
    </svg>
  );
}
