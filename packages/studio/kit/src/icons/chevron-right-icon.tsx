/**
 * The open mark: a chevron pointing right, outline style, in the text colour. Used by the folded
 * long-text field, which opens the text sheet, and by a link row that opens another page.
 * Decoration: the field's name or the row's words say what it is.
 */
export function ChevronRightIcon() {
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
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}
