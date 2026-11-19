/** How much of a folder's end always shows when its line is cut in the middle. */
const TAIL_LENGTH = 24;

/**
 * Where a folder's line is cut so its last {@link TAIL_LENGTH} characters stay: after the last
 * "/" or "\" at or before that point, so the end starts on a whole folder name, when there is one
 * to cut at.
 */
export function middleCutAt(text: string): number {
  const cut = Math.max(0, text.length - TAIL_LENGTH);
  const separator = Math.max(text.lastIndexOf("/", cut), text.lastIndexOf("\\", cut));
  return separator > 0 ? separator : cut;
}

/**
 * A folder on one caption line that, when too long, is cut in the middle so its end, which tells
 * folders apart, stays, such as `…\Documents\Acme sample`. The cut lands on a "/" or "\" when it
 * can.
 *
 * @example
 * <MiddleCut text="~/Documents/Acme Support" />
 */
export function MiddleCut({ text }: { readonly text: string }) {
  const at = middleCutAt(text);
  return (
    <span className="flex min-w-0 text-caption text-fg-subtle">
      <span className="truncate">{text.slice(0, at)}</span>
      <span className="shrink-0 whitespace-pre">{text.slice(at)}</span>
    </span>
  );
}
