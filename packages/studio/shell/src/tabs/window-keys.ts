import type { KeyboardPlatform } from "../points/keybindings.ts";

/**
 * What a window-wide key does in the desktop app (UX checklist part 1, 1.2 and 1.5): open, close
 * and reopen tabs, go to another tab, or move the focus to the toasts.
 */
export type WindowKey =
  | { readonly kind: "new-tab" }
  | { readonly kind: "close-tab" }
  | { readonly kind: "reopen-closed-tab" }
  | { readonly kind: "cycle-tabs"; readonly step: 1 | -1 }
  /** Counted from 0; `-1` is the last tab. */
  | { readonly kind: "activate-tab"; readonly index: number }
  | { readonly kind: "focus-toasts" };

/** The parts of a `KeyboardEvent` that decide which window key it is. */
export interface PressedKey {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const digitCodePattern = /^Digit([1-9])$/;

/**
 * The window key a press means, if any. `Mod` is Cmd on macOS and Ctrl elsewhere, as browsers do
 * it: Mod T opens a tab, Mod W closes the active one, Mod Shift T reopens the last closed one, and
 * Mod 1 to Mod 8 go to that tab, Mod 9 to the last. Ctrl Tab and Ctrl Shift Tab go to the next and
 * the previous tab, with Ctrl on macOS too. F6 alone moves the focus to the toasts. Letters are
 * read by the character they type and digits by their place on the keyboard, so Mod 1 works on a
 * layout where the digits need Shift.
 */
export function windowKeyFor(
  pressed: PressedKey,
  platform: KeyboardPlatform,
): WindowKey | undefined {
  if (pressed.altKey) {
    return undefined;
  }
  if (pressed.key === "F6") {
    return noModifiers(pressed) ? { kind: "focus-toasts" } : undefined;
  }
  if (pressed.key === "Tab") {
    return pressed.ctrlKey && !pressed.metaKey
      ? { kind: "cycle-tabs", step: pressed.shiftKey ? -1 : 1 }
      : undefined;
  }
  return onlyMod(pressed, platform) ? modKeyFor(pressed) : undefined;
}

/** The window key of a press with `Mod` held: T, Shift T, W or a digit. */
function modKeyFor(pressed: PressedKey): WindowKey | undefined {
  const letter = pressed.key.toLowerCase();
  if (letter === "t") {
    return pressed.shiftKey ? { kind: "reopen-closed-tab" } : { kind: "new-tab" };
  }
  if (pressed.shiftKey) {
    return undefined;
  }
  if (letter === "w") {
    return { kind: "close-tab" };
  }
  const digit = digitCodePattern.exec(pressed.code)?.[1];
  if (digit !== undefined) {
    return { kind: "activate-tab", index: digit === "9" ? -1 : Number(digit) - 1 };
  }
  return undefined;
}

function noModifiers(pressed: PressedKey): boolean {
  return !pressed.ctrlKey && !pressed.metaKey && !pressed.shiftKey;
}

/** Whether `Mod` is held and the other of Ctrl and Cmd isn't. Shift is checked by the caller. */
function onlyMod(pressed: PressedKey, platform: KeyboardPlatform): boolean {
  return platform === "macos"
    ? pressed.metaKey && !pressed.ctrlKey
    : pressed.ctrlKey && !pressed.metaKey;
}
