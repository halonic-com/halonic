import { ShellError } from "../shell-error.ts";
import type { KeybindingContribution } from "./commands.ts";
import { type Registered, registered } from "./point-store.ts";

const modifierOrder = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const contextNamePattern = /^[A-Za-z][\w.-]*$/;

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

/**
 * One key in its canonical spelling: a single character in upper case, or a
 * named key spelled as in `KeyboardEvent.key`, whatever case it was written in.
 *
 * @throws ShellError for a name that isn't a known key
 */
function canonicalKey(keys: string, part: string): string {
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
 * and so are `ctrl+arrowup` and `Ctrl+ArrowUp`.
 *
 * @throws ShellError when there's no key, more than one, an unknown key name,
 *   or a repeated modifier
 */
export function normalizeKeys(keys: string): string {
  const modifiers = new Set<string>();
  let key: string | undefined;
  for (const rawPart of keys.split("+")) {
    const part = rawPart.trim();
    const modifier = modifierOrder.find((name) => name.toLowerCase() === part.toLowerCase());
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
 *
 * @throws ShellError for an empty term or a name that isn't a plain identifier
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
    terms.push({ name, negated });
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

  /**
   * Adds a binding.
   *
   * @throws ShellError for bad keys or `when`, or when the same keys and `when` are bound already
   */
  add(featureId: string, binding: KeybindingContribution): void {
    const keys = normalizeKeys(binding.keys);
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
    const pressed = normalizeKeys(keys);
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
