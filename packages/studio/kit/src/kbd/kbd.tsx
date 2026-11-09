export interface KbdProps {
  /**
   * The keys, one box each, in the order you press them: `["Ctrl", "K"]`. The shell picks "Ctrl"
   * or "⌘" for the platform; the kit never guesses it.
   */
  readonly keys: readonly string[];
}

/**
 * The see-through edge keeps each box's shape in Windows high-contrast mode (component specs
 * 23.5), and shows in the text colour when more contrast is asked for, like a StatusChip's.
 */
const keyClasses = [
  "inline-flex min-h-5 min-w-5 items-center justify-center rounded-xs border border-transparent",
  "contrast-more:border-current",
  "bg-surface-muted px-1 font-mono text-caption text-fg-muted",
].join(" ");

/**
 * A keyboard shortcut, as in a menu, the command palette or a tooltip. Not interactive. Hidden on
 * a phone, where there's no keyboard to press it on.
 *
 * @example
 * <Kbd keys={["Ctrl", "K"]} />
 */
export function Kbd({ keys }: KbdProps) {
  return (
    <span className="inline-flex items-center gap-0.5 phone:hidden">
      {keys.map((key, index) => (
        // The same key can appear twice ("G G"), so the position is part of the key.
        <kbd key={`${index}-${key}`} className={keyClasses}>
          {key}
        </kbd>
      ))}
    </span>
  );
}
