import { ShellError } from "../shell-error.ts";
import type { KeybindingContribution } from "./commands.ts";
import { type Registered, registered } from "./point-store.ts";

const modifierOrder = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const contextNamePattern = /^[A-Za-z][\w.-]*$/;
type Modifier = (typeof modifierOrder)[number];

/**
 * The operating system the Studio runs on. The shell stays headless, so the
 * host tells it; it decides what `Mod` means in a binding.
 */
export type KeyboardPlatform = "macos" | "windows" | "linux";

/**
 * The named keys a binding can use, in their `KeyboardEvent.key` spelling.
 * Function keys F1 to F24 are matched separately.
 */
const namedKeys = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  "ContextMenu",
  "Delete",
  "End",
  "Enter",
  "Escape",
  "Home",
  "Insert",
  "PageDown",
  "PageUp",
  "Space",
  "Tab",
] as const;
const namedKeysByLowerCase = new Map<string, string>(
  namedKeys.map((name) => [name.toLowerCase(), name]),
);
const functionKeyPattern = /^f([1-9]|1[0-9]|2[0-4])$/i;

/** Other spellings of a key, by lower case, and the key they mean. */
const keyAliases = new Map<string, string>([
  [" ", "Space"],
  ["esc", "Escape"],
  ["plus", "+"],
]);

/**
 * The modifier each spelling means. `Cmd` is `Meta`; `Mod` is `Cmd` on macOS
 * and `Ctrl` everywhere else.
 */
function modifierFor(part: string, platform: KeyboardPlatform): Modifier | undefined {
  const lowerCase = part.toLowerCase();
  if (lowerCase === "cmd") {
    return "Meta";
  }
  if (lowerCase === "mod") {
    return platform === "macos" ? "Meta" : "Ctrl";
  }
  return modifierOrder.find((name) => name.toLowerCase() === lowerCase);
}

/**
 * What `Mod` means when the host doesn't say which platform it runs on. A
 * macOS desktop host must always pass its platform.
 */
const platformWhenUnknown: KeyboardPlatform = "linux";

/** Keys that end in the space bar, directly after a `+` with no space before it. */
const trailingSpaceKeyPattern = /\S\+ $/;

/**
 * Splits keys on `+` and trims each part. A `+` at the end, after the
 * separator, is the plus key, so `Ctrl++` is Ctrl and `+`. A single space is
 * the space bar, as `KeyboardEvent.key` spells it, but only as the whole keys
 * or directly after the last `+`, as in `Ctrl+ `. Anywhere else it is padding,
 * so the typo `Ctrl + ` is refused instead of becoming `Ctrl+Space`.
 */
function splitKeys(keys: string): string[] {
  if (keys === "+" || keys === " ") {
    return [keys];
  }
  if (keys.endsWith("++")) {
    return [...trimmedParts(keys.slice(0, -2)), "+"];
  }
  if (trailingSpaceKeyPattern.test(keys)) {
    return [...trimmedParts(keys.slice(0, -2)), " "];
  }
  return trimmedParts(keys);
}

function trimmedParts(keys: string): string[] {
  return keys.split("+").map((part) => part.trim());
}

/**
 * One key in its canonical spelling: a single character in upper case, or a
 * named key spelled as in `KeyboardEvent.key`, whatever case it was written in.
 *
 * @throws ShellError for a name that isn't a known key
 */
function canonicalKey(keys: string, part: string): string {
  const alias = keyAliases.get(part.toLowerCase());
  if (alias !== undefined) {
    return alias;
  }
  if ([...part].length === 1) {
    return part.toUpperCase();
  }
  const named = namedKeysByLowerCase.get(part.toLowerCase());
  if (named !== undefined) {
    return named;
  }
  const functionKey = functionKeyPattern.exec(part);
  if (functionKey !== null) {
    return `F${functionKey[1]}`;
  }
  throw new ShellError(
    `The keys "${keys}" name the key "${part}", which isn't a single character, F1 to F24, or one of ${namedKeys.join(", ")}.`,
  );
}

/** One term of a `when`: a context name that must be active, or must not be. */
interface WhenTerm {
  readonly name: string;
  readonly negated: boolean;
}

/** A keybinding with its keys and `when` in one canonical form. */
interface Entry {
  readonly binding: Registered<KeybindingContribution>;
  readonly keys: string;
  readonly when: readonly WhenTerm[];
}

/**
 * Writes keys in one form, so `alt+ctrl+a` and `Ctrl+Alt+A` are the same,
 * and so are `ctrl+arrowup` and `Ctrl+ArrowUp`, `Esc` and `Escape`, and
 * `Cmd+S` and `Meta+S`. `Mod` becomes `Meta` on macOS and `Ctrl` elsewhere.
 *
 * @throws ShellError when there's no key, more than one, an unknown key name,
 *   or a repeated modifier
 */
export function normalizeKeys(
  keys: string,
  platform: KeyboardPlatform = platformWhenUnknown,
): string {
  const modifiers = new Set<Modifier>();
  let key: string | undefined;
  for (const part of splitKeys(keys)) {
    const modifier = modifierFor(part, platform);
    if (modifier !== undefined) {
      if (modifiers.has(modifier)) {
        throw new ShellError(`The keys "${keys}" name ${modifier} twice.`);
      }
      modifiers.add(modifier);
      continue;
    }
    if (part === "" || key !== undefined) {
      throw new ShellError(
        `The keys "${keys}" need exactly one key besides the modifiers, such as "Ctrl+Alt+A".`,
      );
    }
    key = canonicalKey(keys, part);
  }
  if (key === undefined) {
    throw new ShellError(
      `The keys "${keys}" need a key besides the modifiers, such as "Ctrl+Alt+A".`,
    );
  }
  return [...modifierOrder.filter((name) => modifiers.has(name)), key].join("+");
}

/**
 * Reads a `when`: context names joined by `&&`, each optionally negated with `!`.
 * A term written twice counts once, so `a && a` is as specific as `a`.
 *
 * @throws ShellError for an empty term, a name that isn't a plain identifier,
 *   or a name both required and negated, which can never hold
 */
export function parseWhen(when: string | undefined): WhenTerm[] {
  if (when === undefined) {
    return [];
  }
  const terms: WhenTerm[] = [];
  for (const rawTerm of when.split("&&")) {
    const term = rawTerm.trim();
    const negated = term.startsWith("!");
    const name = negated ? term.slice(1).trim() : term;
    if (!contextNamePattern.test(name)) {
      throw new ShellError(
        `The keybinding condition "${when}" is not valid. Use context names joined by "&&", each optionally starting with "!".`,
      );
    }
    const same = terms.find((existing) => existing.name === name);
    if (same === undefined) {
      terms.push({ name, negated });
    } else if (same.negated !== negated) {
      throw new ShellError(
        `The keybinding condition "${when}" asks for "${name}" and "!${name}" at once, so it can never hold.`,
      );
    }
  }
  return terms.sort(byName);
}

function byName(left: WhenTerm, right: WhenTerm): number {
  if (left.name === right.name) {
    return 0;
  }
  return left.name < right.name ? -1 : 1;
}

function sameWhen(left: readonly WhenTerm[], right: readonly WhenTerm[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (term, index) => term.name === right[index]?.name && term.negated === right[index]?.negated,
  );
}

function holds(when: readonly WhenTerm[], active: ReadonlySet<string>): boolean {
  return when.every((term) => active.has(term.name) !== term.negated);
}

/**
 * Every keybinding, and the rule for which one a key press runs: of the
 * bindings whose `when` holds, the one with the most conditions wins, so a
 * shortcut inside the code editor beats the same shortcut everywhere.
 * Between equally specific ones, the first registered wins.
 */
export class KeybindingTable {
  private readonly entries: Entry[] = [];
  private readonly platform: KeyboardPlatform;

  /** @param platform decides what `Mod` means, in bindings and in key presses */
  constructor(platform: KeyboardPlatform = platformWhenUnknown) {
    this.platform = platform;
  }

  /**
   * Adds a binding.
   *
   * @throws ShellError for bad keys or `when`, or when the same keys and `when` are bound already
   */
  add(featureId: string, binding: KeybindingContribution): void {
    const keys = normalizeKeys(binding.keys, this.platform);
    const when = parseWhen(binding.when);
    const existing = this.entries.find(
      (entry) => entry.keys === keys && sameWhen(entry.when, when),
    );
    if (existing !== undefined) {
      const context = binding.when === undefined ? "everywhere" : `when "${binding.when}"`;
      throw new ShellError(
        `keybindings.add: ${keys} ${context} is bound by both "${existing.binding.featureId}" (${existing.binding.command}) and "${featureId}" (${binding.command}). Pick other keys or a narrower "when".`,
      );
    }
    this.entries.push({ binding: registered("keybindings.add", featureId, binding), keys, when });
  }

  /** The binding a key press runs while the given contexts are active, if any. */
  resolve(
    keys: string,
    activeContexts: ReadonlySet<string>,
  ): Registered<KeybindingContribution> | undefined {
    const pressed = normalizeKeys(keys, this.platform);
    let best: Entry | undefined;
    for (const entry of this.entries) {
      if (entry.keys !== pressed || !holds(entry.when, activeContexts)) {
        continue;
      }
      if (best === undefined || entry.when.length > best.when.length) {
        best = entry;
      }
    }
    return best?.binding;
  }

  /** Every binding, in the order they were added. */
  list(): readonly Registered<KeybindingContribution>[] {
    return this.entries.map((entry) => entry.binding);
  }
}
