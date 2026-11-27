/**
 * The unread mark: a ring round a dot, outline style, in the text colour. Used by a row's **Mark as
 * unread** icon button (`kit.list-plain-action-icon`). Decoration: the button's name says it.
 */
export function UnreadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
