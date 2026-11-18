/** The props of `CodeDisplay`. */
export interface CodeDisplayProps {
  /** The code, without spaces: "4F72KQ". */
  readonly code: string;
  /** How many characters make a group: 3 for a check code ("4F7 · 2KQ"), 4 for a typed code. */
  readonly group: number;
  /**
   * `lg`, the default, is the check code to compare: 36px, centred in a `surface-subtle` box.
   * `md` is a code to type on another screen: 28px, in line with the text round it.
   */
  readonly size?: "lg" | "md";
  /** What the code is, said before it: "Check code". Without it, the code alone is its name. */
  readonly label?: string;
}

const looks = {
  lg: "justify-center gap-5 rounded-md border border-border-strong bg-surface-subtle py-5 text-display",
  md: "gap-4 text-title",
} as const;

/**
 * A short code a person reads on one screen and compares or types on another: large, in mono, in
 * groups with a dot between them. A screen reader reads it one character at a time ("4, F, 7, 2,
 * K, Q"), not as a word. The dot is decoration.
 *
 * @example
 * <CodeDisplay code="4F72KQ" group={3} label="Check code" />
 * <CodeDisplay code="7KQ2M4XD9TH6" group={4} size="md" />
 */
export function CodeDisplay({ code, group, size = "lg", label }: CodeDisplayProps) {
  const characters = [...code];
  const spoken = characters.join(", ");
  const groups: string[] = [];
  for (let start = 0; start < characters.length; start += group) {
    groups.push(characters.slice(start, start + group).join(""));
  }
  return (
    <div
      role="img"
      aria-label={label === undefined ? spoken : `${label}: ${spoken}`}
      className={`flex items-center font-mono font-semibold text-fg ${looks[size]}`}
    >
      {groups.map((part, index) => (
        // A code can repeat a group ("AAA AAA"), so the place is the key; the groups never move.
        <span key={index} className="contents">
          {index === 0 ? null : (
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fg-subtle" />
          )}
          <span aria-hidden="true">{part}</span>
        </span>
      ))}
    </div>
  );
}
