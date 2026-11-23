import { type KeyboardPlatform, normalizeKeys } from "./keybindings.ts";

/**
 * How a hint writes a key that its binding spells another way. On macOS the modifiers are the
 * symbols its menus print; elsewhere they keep their names, and `Meta`, which the Studio binds
 * nothing to there, does too.
 */
function hintFor(key: string, platform: KeyboardPlatform): string {
  const macSymbol = platform === "macos" ? macModifiers[key] : undefined;
  return macSymbol ?? hintsByKey[key] ?? key;
}

/** The modifiers as macOS writes them; the kit's `keyShortcutsLabel` reads each one back. */
const macModifiers: Readonly<Record<string, string>> = {
  Ctrl: "⌃",
  Meta: "⌘",
  Alt: "⌥",
  Shift: "⇧",
};

/** The named keys a Kbd draws shorter; the kit's `keyShortcutsLabel` reads each one back. */
const hintsByKey: Readonly<Record<string, string>> = {
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/**
 * The keys a Kbd shows for a binding, one box each, the modifiers first. `Mod` is ⌘ on macOS and
 * Ctrl elsewhere, and on macOS every modifier is its symbol, so every hint in the Studio reads the
 * same: `"Mod+Shift+T"` is `["⌘", "⇧", "T"]` on a Mac and `["Ctrl", "Shift", "T"]` on Windows. Give
 * the control the same keys in `aria-keyshortcuts` with the kit's `keyShortcutsLabel`.
 *
 * @throws ShellError for keys a keybinding couldn't use either, such as `"Ctrl+"`
 *
 * @example
 * const keys = hintKeys("Mod+K", platform);
 * <button aria-keyshortcuts={keyShortcutsLabel(keys)}>Search <Kbd keys={keys} /></button>
 */
export function hintKeys(keys: string, platform: KeyboardPlatform): string[] {
  const normalized = normalizeKeys(keys, platform);
  // The key is whatever follows the last `+` between modifiers; the plus key itself ends in "++".
  const plusKey = normalized === "+" || normalized.endsWith("++");
  const modifiersEnd = plusKey ? normalized.length - 2 : normalized.lastIndexOf("+");
  const key = modifiersEnd < 0 ? normalized : normalized.slice(modifiersEnd + 1);
  const modifiers = modifiersEnd < 0 ? [] : normalized.slice(0, modifiersEnd).split("+");
  return [...hintOrder.filter((each) => modifiers.includes(each)), key].map((each) =>
    hintFor(each, platform),
  );
}

/**
 * The order a hint shows the modifiers in. Meta comes right after Ctrl, so `Mod` is always first:
 * ⌘ ⇧ T on macOS reads like Ctrl Shift T elsewhere.
 */
const hintOrder = ["Ctrl", "Meta", "Alt", "Shift"];
