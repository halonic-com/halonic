import { err, ok, type Result } from "@halonicjs/std";

/** The longest value a user may paste back into a `browser` block's result field. */
export const maxResultLength = 200;

/** One piece of a result pattern: which characters it takes, and how many times. */
interface Atom {
  takes: (character: string) => boolean;
  min: number;
  max: number;
}

/**
 * A requester's result pattern, compiled. It matches in time bounded by the
 * pattern's and the value's lengths, never by backtracking, because the
 * requester writes the pattern and Studio runs it (Julian's review of #5671).
 */
export interface ResultPattern {
  matches(value: string): boolean;
}

const digit = (character: string): boolean => character >= "0" && character <= "9";
const word = (character: string): boolean =>
  digit(character) ||
  (character >= "a" && character <= "z") ||
  (character >= "A" && character <= "Z") ||
  character === "_";

/** Characters that mean something in a pattern; written alone, they're refused. */
const special = new Set([..."\\^$.|?*+()[]{}"]);

/** Reads a pattern one character at a time. */
class Reader {
  readonly text: string;
  position = 0;
  constructor(text: string) {
    this.text = text;
  }
  get done(): boolean {
    return this.position >= this.text.length;
  }
  peek(): string {
    return this.text.charAt(this.position);
  }
  next(): string {
    const character = this.text.charAt(this.position);
    this.position += 1;
    return character;
  }
}

function escaped(reader: Reader): Result<(character: string) => boolean, string> {
  const character = reader.next();
  if (character === "d") return ok(digit);
  if (character === "w") return ok(word);
  if (special.has(character) || character === "-" || character === "/") {
    return ok((candidate) => candidate === character);
  }
  return err(`\`\\${character}\` isn't allowed`);
}

function classItem(reader: Reader): Result<(character: string) => boolean, string> {
  if (reader.peek() === "\\") {
    reader.next();
    return escaped(reader);
  }
  const low = reader.next();
  if (reader.peek() !== "-" || reader.text.charAt(reader.position + 1) === "]") {
    return ok((candidate) => candidate === low);
  }
  reader.next();
  const high = reader.next();
  if (high < low) return err(`the range \`${low}-${high}\` is backwards`);
  return ok((candidate) => candidate >= low && candidate <= high);
}

function characterClass(reader: Reader): Result<(character: string) => boolean, string> {
  if (reader.peek() === "^") return err("a negated class `[^…]` isn't allowed");
  const items: ((character: string) => boolean)[] = [];
  while (!reader.done && reader.peek() !== "]") {
    const item = classItem(reader);
    if (!item.ok) return item;
    items.push(item.value);
  }
  if (reader.next() !== "]" || items.length === 0)
    return err("a class `[…]` isn't closed or is empty");
  return ok((candidate) => items.some((item) => item(candidate)));
}

function single(reader: Reader): Result<(character: string) => boolean, string> {
  const character = reader.next();
  if (character === "\\") return escaped(reader);
  if (character === "[") return characterClass(reader);
  if (special.has(character))
    return err(`\`${character}\` isn't allowed here: only literals, classes and counts`);
  return ok((candidate) => candidate === character);
}

function count(reader: Reader): Result<{ min: number; max: number }, string> {
  const marker = reader.peek();
  if (marker === "?" || marker === "*" || marker === "+") {
    reader.next();
    return ok({ min: marker === "+" ? 1 : 0, max: marker === "?" ? 1 : maxResultLength });
  }
  if (marker !== "{") return ok({ min: 1, max: 1 });
  const close = reader.text.indexOf("}", reader.position);
  const bounds = /^\{(\d{1,3})(?:,(\d{1,3}))?\}$/.exec(
    reader.text.slice(reader.position, close + 1),
  );
  if (close === -1 || bounds === null) return err("a count must be `{n}` or `{n,m}`");
  reader.position = close + 1;
  const min = Number(bounds[1]);
  const max = bounds[2] === undefined ? min : Number(bounds[2]);
  if (max < min) return err(`the count \`{${min},${max}}\` is backwards`);
  return ok({ min, max: Math.min(max, maxResultLength) });
}

/**
 * Compiles a `browser` block's result pattern. Only a small, safe part of
 * pattern syntax is allowed: `^` and `$` around a sequence of literals, `\d`,
 * `\w`, escaped punctuation and classes such as `[a-z0-9-]`, each with an
 * optional `?`, `*`, `+`, `{n}` or `{n,m}`. No groups, alternation, `.` or
 * back-references.
 *
 * @example
 * const pattern = compileResultPattern("^[a-z][a-z0-9-]{5,29}$");
 * pattern.ok && pattern.value.matches("acme-prod"); // true
 */
export function compileResultPattern(pattern: string): Result<ResultPattern, string> {
  if (!pattern.startsWith("^") || !pattern.endsWith("$") || pattern.length < 3) {
    return err("it must start with ^ and end with $");
  }
  const reader = new Reader(pattern.slice(1, -1));
  const atoms: Atom[] = [];
  while (!reader.done) {
    const takes = single(reader);
    if (!takes.ok) return takes;
    const counted = count(reader);
    if (!counted.ok) return counted;
    atoms.push({ takes: takes.value, ...counted.value });
  }
  return ok({ matches: (value) => matchAtoms(atoms, value) });
}

/** Adds every position an atom can end at when it starts at `start`. */
function addEnds(atom: Atom, value: string, start: number, ends: Set<number>): void {
  if (atom.min === 0) ends.add(start);
  let end = start;
  for (let taken = 1; taken <= atom.max && end < value.length; taken += 1) {
    if (!atom.takes(value.charAt(end))) return;
    end += 1;
    if (taken >= atom.min) ends.add(end);
  }
}

/** Which end positions each prefix of the atoms can reach: at most atoms × length × count steps. */
function matchAtoms(atoms: readonly Atom[], value: string): boolean {
  if (value.length > maxResultLength) return false;
  let reachable = new Set<number>([0]);
  for (const atom of atoms) {
    const next = new Set<number>();
    for (const start of reachable) addEnds(atom, value, start, next);
    if (next.size === 0) return false;
    reachable = next;
  }
  return reachable.has(value.length);
}
