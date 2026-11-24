/**
 * Splits prepared text into tokens (spec 1.3). Lexing never fails: a
 * character that matches no rule is skipped, and a string still open at the
 * end is closed, which is the first half of the "close what's open" step.
 */

export type Token =
  | { readonly kind: "string"; readonly value: string; readonly closed: boolean }
  | { readonly kind: "number"; readonly value: number }
  /** An identifier, keywords included. */
  | { readonly kind: "name"; readonly value: string }
  /** `$name`, with the `$`. */
  | { readonly kind: "state"; readonly value: string }
  /** `@Name`, without the `@`. */
  | { readonly kind: "function"; readonly value: string }
  | { readonly kind: "punct"; readonly value: string }
  | { readonly kind: "newline" };

export type Located<T extends Token = Token> = T & { readonly start: number; readonly end: number };

const TWO_CHAR = new Set(["==", "!=", ">=", "<=", "&&", "||"]);
const ONE_CHAR = "=><+-*/%!?:.,()[]{}&|";
const DOUBLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
};
const SINGLE_ESCAPES: Readonly<Record<string, string>> = { n: "\n", t: "\t" };
const NUMBER = /-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]*)?/y;
const NAME = /[A-Za-z_]\w*/y;

/** The match of a sticky pattern at `index`, or "". */
function matchAt(pattern: RegExp, text: string, index: number): string {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0] ?? "";
}

export function lex(text: string): Located[] {
  const tokens: Located[] = [];
  let index = 0;
  while (index < text.length) {
    const read = readToken(text, index, tokens);
    if (read.token) tokens.push({ ...read.token, start: index, end: read.end });
    index = read.end;
  }
  return tokens;
}

/** The token at `index` and where it ends; a character that matches no rule is skipped. */
function readToken(
  text: string,
  index: number,
  before: readonly Token[],
): { token?: Token; end: number } {
  const char = text[index] ?? "";
  if (char === "\n") return { token: { kind: "newline" }, end: index + 1 };
  if (char === '"' || char === "'") {
    const { value, closed, end } = readString(text, index);
    return { token: { kind: "string", value, closed }, end };
  }
  if (startsNumber(text, index, before)) {
    const end = index + matchAt(NUMBER, text, index).length;
    return { token: { kind: "number", value: Number.parseFloat(text.slice(index, end)) }, end };
  }
  const sigilName = char === "$" || char === "@" ? matchAt(NAME, text, index + 1) : "";
  if (sigilName !== "") {
    const token: Token =
      char === "$"
        ? { kind: "state", value: `$${sigilName}` }
        : { kind: "function", value: sigilName };
    return { token, end: index + sigilName.length + 1 };
  }
  const name = matchAt(NAME, text, index);
  if (name !== "") return { token: { kind: "name", value: name }, end: index + name.length };
  return readPunct(text, index);
}

function readPunct(text: string, index: number): { token?: Token; end: number } {
  const pair = text.slice(index, index + 2);
  if (TWO_CHAR.has(pair)) return { token: { kind: "punct", value: pair }, end: index + 2 };
  const char = text[index] ?? "";
  if (!ONE_CHAR.includes(char)) return { end: index + 1 };
  // A single `&` or `|` means `&&` or `||`.
  const value = char === "&" || char === "|" ? char + char : char;
  return { token: { kind: "punct", value }, end: index + 1 };
}

/** A digit starts a number; so does `-` before a digit, unless it follows a value (spec 1.3). */
function startsNumber(text: string, index: number, before: readonly Token[]): boolean {
  const isDigit = (char: string | undefined) => char !== undefined && char >= "0" && char <= "9";
  if (isDigit(text[index])) return true;
  return text[index] === "-" && isDigit(text[index + 1]) && !followsValue(before);
}

/** Whether the token before a `-` is a value, which makes the `-` an operator. */
function followsValue(tokens: readonly Token[]): boolean {
  const last = tokens.at(-1);
  if (!last || last.kind === "newline" || last.kind === "function") return false;
  return last.kind !== "punct" || last.value === ")" || last.value === "]";
}

function readString(text: string, start: number): { value: string; closed: boolean; end: number } {
  const quote = text[start] ?? "";
  let value = "";
  let index = start + 1;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === quote) return { value, closed: true, end: index + 1 };
    if (char === "\\") {
      const escaped = readEscape(text, index, quote);
      value += escaped.value;
      index = escaped.end;
    } else {
      value += char;
      index++;
    }
  }
  return { value, closed: false, end: text.length };
}

/** The escape starting at the backslash at `index`. */
function readEscape(text: string, index: number, quote: string): { value: string; end: number } {
  const next = text[index + 1];
  // A text that ends mid-escape is closed with an escaped backslash (spec 4, rule 2).
  if (next === undefined) return { value: "\\", end: text.length };
  const hex =
    quote === '"' && next === "u" ? /^[0-9a-fA-F]{4}/.exec(text.slice(index + 2, index + 6)) : null;
  if (hex) return { value: String.fromCharCode(Number.parseInt(hex[0], 16)), end: index + 6 };
  const escapes = quote === '"' ? DOUBLE_ESCAPES : SINGLE_ESCAPES;
  return { value: escapes[next] ?? next, end: index + 2 };
}
