import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/**
 * The shortcut the shell uses when none is saved (`DEFAULT_SHORTCUT` in `feedback_held.rs`):
 * Ctrl+Alt+F, ⌘ ⌥ F on macOS.
 */
export const defaultShortcut = "CommandOrControl+Alt+F";

/** The keys of a key press the recording control reads; a `KeyboardEvent` is one. */
export interface PressedKeys {
  /** The physical key, as `KeyboardEvent.code` names it: "KeyK", "Digit1", "F5". */
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

/** The codes of the modifier keys themselves: pressing one alone records nothing yet. */
const modifierCodes = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

/**
 * The shortcut a key press records, in the words the shell reads (`Shortcut::from_str`):
 * `"Control+Alt+KeyK"`. It names the physical key, so a layout that types another letter there
 * still gives the shortcut the shell hears. `undefined` while only modifiers are held, and for a
 * key without Ctrl, Alt or ⌘: the shell refuses those as `invalid`, because a global Shift+F would
 * take every capital F typed in any app.
 */
export function recordedShortcut(press: PressedKeys): string | undefined {
  if (modifierCodes.test(press.code) || press.code === "") return undefined;
  if (!(press.ctrlKey || press.altKey || press.metaKey)) return undefined;
  const modifiers = [
    press.ctrlKey ? "Control" : undefined,
    press.metaKey ? "Super" : undefined,
    press.altKey ? "Alt" : undefined,
    press.shiftKey ? "Shift" : undefined,
  ].filter((modifier) => modifier !== undefined);
  return [...modifiers, press.code].join("+");
}

/** Each modifier word the shell reads, as the modifier it is; `CommandOrControl` is ⌘ on macOS. */
const modifierOf: Readonly<Record<string, "Ctrl" | "Super" | "Alt" | "Shift" | "Mod">> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  super: "Super",
  command: "Super",
  cmd: "Super",
  meta: "Super",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  commandorcontrol: "Mod",
  commandorctrl: "Mod",
  cmdorctrl: "Mod",
  cmdorcontrol: "Mod",
};

/** The order the keys show in, as every hint in the Studio (`hintKeys`): Ctrl, ⌘, Alt, Shift. */
const shownOrder = ["Ctrl", "Super", "Alt", "Shift"] as const;

/** How each modifier is written, on macOS as its menus print it. */
const modifierNames: Readonly<
  Record<KeyboardPlatform, Record<(typeof shownOrder)[number], string>>
> = {
  macos: { Ctrl: "⌃", Super: "⌘", Alt: "⌥", Shift: "⇧" },
  windows: { Ctrl: "Ctrl", Super: "Win", Alt: "Alt", Shift: "Shift" },
  linux: { Ctrl: "Ctrl", Super: "Super", Alt: "Alt", Shift: "Shift" },
};

/** The named keys a Kbd draws shorter, as the Studio's hints do. */
const shortKeys: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
};

/** A key as it shows: "KeyK" is "K", "Digit1" is "1", "ArrowUp" is "↑". */
function keyName(code: string): string {
  const letterOrDigit = /^(?:Key|Digit)(.)$/i.exec(code);
  if (letterOrDigit?.[1] !== undefined) return letterOrDigit[1].toUpperCase();
  return shortKeys[code] ?? code;
}

/**
 * The keys a Kbd shows for a shortcut as the shell saves it (`"control+alt+KeyK"`) or as
 * {@link recordedShortcut} records it, one box each, the modifiers first: `["Ctrl", "Alt", "K"]`,
 * `["⌃", "⌥", "K"]` on macOS.
 */
export function shortcutKeys(shortcut: string, platform: KeyboardPlatform): string[] {
  const parts = shortcut.split("+").map((part) => part.trim());
  const key = parts.at(-1) ?? "";
  const held = new Set(
    parts.slice(0, -1).map((part) => {
      const modifier = modifierOf[part.toLowerCase()];
      if (modifier !== "Mod") return modifier;
      return platform === "macos" ? "Super" : "Ctrl";
    }),
  );
  const names = modifierNames[platform];
  return [
    ...shownOrder.filter((modifier) => held.has(modifier)).map((m) => names[m]),
    keyName(key),
  ];
}

/** A shortcut in a sentence: "Ctrl+Alt+K", and "⌃⌥K" on macOS, as its menus write it. */
export function shortcutText(keys: readonly string[], platform: KeyboardPlatform): string {
  return keys.join(platform === "macos" ? "" : "+");
}
