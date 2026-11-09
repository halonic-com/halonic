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
  // In the active menu item, on its muted fill, the key's box steps up so it doesn't vanish.
  "on-muted:bg-border on-muted:text-fg",
].join(" ");

/**
 * A keyboard shortcut, as in a menu, the command palette or a tooltip. Not interactive. Hidden on
 * a phone, where there's no keyboard to press it on.
 *
 * Hidden from screen readers too: the control it belongs to names the shortcut with
 * `aria-keyshortcuts={keyShortcutsLabel(keys)}`, from the same keys (component specs 23 A9).
 *
 * @example
 * <Kbd keys={["Ctrl", "K"]} />
 */
export function Kbd({ keys }: KbdProps) {
  return (
    <span className="inline-flex items-center gap-0.5 phone:hidden" aria-hidden="true">
      {keys.map((key, index) => (
        // The same key can appear twice ("G G"), so the position is part of the key.
        <kbd key={`${index}-${key}`} className={keyClasses}>
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** The names `aria-keyshortcuts` uses for the keys a Kbd draws differently. */
const keyNames: Readonly<Record<string, string>> = {
  Ctrl: "Control",
  "⌃": "Control",
  "⌘": "Meta",
  Cmd: "Meta",
  "⌥": "Alt",
  Option: "Alt",
  "⇧": "Shift",
  Esc: "Escape",
  "↵": "Enter",
  "⏎": "Enter",
  "⌫": "Backspace",
  Del: "Delete",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
};

/**
 * The `aria-keyshortcuts` value for the keys a Kbd shows, pressed together: `["Ctrl", "Shift",
 * "T"]` is "Control+Shift+T", and `["⌘", "K"]` is "Meta+K". The menu item, the tooltip's trigger
 * and the palette set it from the same `keys` they give the Kbd, so the two can't differ.
 *
 * @example
 * <button aria-keyshortcuts={keyShortcutsLabel(keys)}>New tab <Kbd keys={keys} /></button>
 */
export function keyShortcutsLabel(keys: readonly string[]): string {
  return keys.map((key) => keyNames[key] ?? key).join("+");
}
