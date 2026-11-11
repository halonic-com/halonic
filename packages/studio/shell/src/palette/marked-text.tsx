/** Props for {@link MarkedText}. */
export interface MarkedTextProps {
  readonly text: string;
  /** Where the typed words are in `text`, in UTF-16 code units, the end exclusive. */
  readonly found: { readonly start: number; readonly end: number } | undefined;
}

/**
 * Text with the typed words marked in `accent-soft`, as Ctrl K's rows, the Search page and the
 * phone's rows mark them. Without words found, the text shows as it is.
 */
export function MarkedText({ text, found }: MarkedTextProps) {
  if (found === undefined || found.start === found.end) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, found.start)}
      <mark className="rounded-xs bg-accent-soft text-fg">
        {text.slice(found.start, found.end)}
      </mark>
      {text.slice(found.end)}
    </>
  );
}
