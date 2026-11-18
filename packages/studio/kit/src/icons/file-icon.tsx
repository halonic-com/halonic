/**
 * The file mark: a page with a folded corner and two lines of text, outline style, in the text
 * colour, on the place icons' 24 grid and line, for a file that is not an item (a README, a note).
 */
export function FileIcon() {
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
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h7" />
    </svg>
  );
}
