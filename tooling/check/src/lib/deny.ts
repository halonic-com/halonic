/**
 * Reads the lists in `apps/studio/src-tauri/deny.toml` that the guard and the
 * release notices check: `[licenses] allow` and `exceptions`, and
 * `[advisories] ignore`. A small reader for
 * exactly those shapes, not a TOML parser: the file is ours and the guard
 * fails on anything it can't read, so a change of shape can't slip past.
 */

/** One `ignore` entry of `[advisories]`. */
export interface DenyIgnore {
  readonly id: string;
  readonly reason: string;
  /** Written as a plain string (`"RUSTSEC-…"`), which has no place for a reason or expiry. */
  readonly plain?: true;
}

/** One `exceptions` entry of `[licenses]`: licences allowed for one crate only. */
export interface DenyException {
  readonly crate: string;
  readonly allow: readonly string[];
}

/** The lists, or `undefined` for one that is missing or not in the expected shape. */
export interface DenyReading {
  readonly allow: readonly string[] | undefined;
  readonly exceptions: readonly DenyException[] | undefined;
  readonly ignore: readonly DenyIgnore[] | undefined;
}

const string = /"((?:[^"\\]|\\.)*)"/g;

/** Index of the quote that closes the string opening at `open`, or the end of the text. */
function closingQuote(text: string, open: number): number {
  for (let index = open + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
    } else if (text[index] === '"') {
      return index;
    }
  }
  return text.length;
}

/** The lines of one `[section]`, comments blanked, joined again. */
function sectionBody(text: string, section: string): string {
  const body: string[] = [];
  let inside = false;
  for (const line of text.split("\n")) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header !== null) {
      inside = header[1]?.trim() === section;
    } else if (inside) {
      body.push(line.trimStart().startsWith("#") ? "" : line);
    }
  }
  return body.join("\n");
}

/** Index of the `]` that closes an array whose body starts at `from`, with brackets inside strings left alone. */
function closingBracket(text: string, from: number): number | undefined {
  let depth = 1;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      index = closingQuote(text, index);
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return undefined;
}

/** The text of `key = [ ... ]` inside one `[section]`, up to the matching bracket. */
function arrayOf(text: string, section: string, key: string): string | undefined {
  const joined = sectionBody(text, section);
  const start = new RegExp(`^${key}\\s*=\\s*\\[`, "m").exec(joined);
  if (start === null) {
    return undefined;
  }
  const from = start.index + start[0].length;
  const end = closingBracket(joined, from);
  return end === undefined ? undefined : joined.slice(from, end);
}

function strings(text: string): string[] {
  return [...text.matchAll(string)].map((match) => JSON.parse(`"${match[1]}"`) as string);
}

/** The `{ ... }` tables of an array body, with braces inside strings left alone. */
function tables(text: string): string[] {
  const found: string[] = [];
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      index = closingQuote(text, index);
    } else if (char === "{") {
      start = index;
    } else if (char === "}" && start >= 0) {
      found.push(text.slice(start + 1, index));
      start = -1;
    }
  }
  return found;
}

/** The strings of an array body that sit outside any `{ ... }` table. */
function plainStrings(text: string): string[] {
  let rest = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (char === '"') {
      const end = closingQuote(text, index);
      rest += depth === 0 ? text.slice(index, end + 1) : "";
      index = end;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      rest += char;
    }
  }
  return strings(rest);
}

function field(table: string, key: string): string {
  const match = new RegExp(`(?:^|[,\\s])${key}\\s*=\\s*${string.source}`).exec(table);
  return match?.[1] === undefined ? "" : (JSON.parse(`"${match[1]}"`) as string);
}

/** The strings of `key = [ ... ]` inside one table, or `undefined` when it has none. */
function arrayField(table: string, key: string): string[] | undefined {
  const start = new RegExp(`(?:^|[,\\s])${key}\\s*=\\s*\\[`).exec(table);
  if (start === null) {
    return undefined;
  }
  const from = start.index + start[0].length;
  const end = closingBracket(table, from);
  return end === undefined ? undefined : strings(table.slice(from, end));
}

/** The exception tables, or `undefined` when one of them lacks its crate or its list. */
function readExceptions(body: string): DenyException[] | undefined {
  const found: DenyException[] = [];
  for (const table of tables(body)) {
    const crate = field(table, "crate");
    const allow = arrayField(table, "allow");
    if (crate === "" || allow === undefined) {
      return undefined;
    }
    found.push({ crate, allow });
  }
  return found;
}

/** Reads `[licenses] allow` and `exceptions` and `[advisories] ignore` from the file text. */
export function readDeny(text: string): DenyReading {
  const allow = arrayOf(text, "licenses", "allow");
  const exceptions = arrayOf(text, "licenses", "exceptions");
  const ignore = arrayOf(text, "advisories", "ignore");
  return {
    allow: allow === undefined ? undefined : strings(allow),
    exceptions: exceptions === undefined ? undefined : readExceptions(exceptions),
    ignore:
      ignore === undefined
        ? undefined
        : [
            ...plainStrings(ignore).map((id) => ({ id, reason: "", plain: true as const })),
            ...tables(ignore).map((table) => ({
              id: field(table, "id"),
              reason: field(table, "reason"),
            })),
          ],
  };
}
