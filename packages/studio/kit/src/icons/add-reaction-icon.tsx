/**
 * The add-a-reaction mark: a smiling face with a + at its top right, outline style, in the text
 * colour, on the place icons' 24 grid and line. The Messenger's round "Add a reaction" button
 * beside a message shows it (HAL-19139). The face's ring opens where the + sits, so the two
 * lines never touch at 16px. Decoration: the button's name says what it does.
 */
export function AddReactionIcon() {
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
      <path d="M19 13a8 8 0 1 1-8-8" />
      <path d="M8.5 11h.01" />
      <path d="M13.5 11h.01" />
      <path d="M8 15.5a4 4 0 0 0 6 0" />
      <path d="M19 2v6" />
      <path d="M16 5h6" />
    </svg>
  );
}
