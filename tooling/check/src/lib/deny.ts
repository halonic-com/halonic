/**
 * Reads the two lists in `apps/studio/src-tauri/deny.toml` that the guard
 * checks: `[licenses] allow` and `[advisories] ignore`. A small reader for
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

/** The lists, or `undefined` for one that is missing or not in the expected shape. */
export interface DenyReading {
  readonly allow: readonly string[] | undefined;
  readonly ignore: readonly DenyIgnore[] | undefined;
}

const string = /"((?:[^"\\]|\\.)*)"/g;

/** The text of `key = [ ... ]` inside one `[section]`, up to the matching bracket. */
function arrayOf(text: string, section: string, key: string): string | undefined {
  const lines = text.split("\n").map((line) => (line.trimStart().startsWith("#") ? "" : line));
  const body: string[] = [];
  let inside = false;
  for (const line of lines) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header !== null) {
      inside = header[1]?.trim() === section;
    } else if (inside) {
      body.push(line);
    }
  }
  const joined = body.join("\n");
  const start = new RegExp(`^${key}\\s*=\\s*\\[`, "m").exec(joined);
  if (start === null) {
    return undefined;
  }
  let depth = 1;
  let quoted = false;
  for (let index = start.index + start[0].length; index < joined.length; index += 1) {
    const char = joined[index];
    if (quoted) {
      if (char === "\\") {
        index += 1;
      } else if (char === '"') {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return joined.slice(start.index + start[0].length, index);
      }
    }
  }
  return undefined;
}

function strings(text: string): string[] {
  return [...text.matchAll(string)].map((match) => JSON.parse(`"${match[1]}"`) as string);
}

/** The `{ ... }` tables of an array body, with braces inside strings left alone. */
function tables(text: string): string[] {
  const found: string[] = [];
  let quoted = false;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\\") {
        index += 1;
      } else if (char === '"') {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
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
  let quoted = false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (quoted) {
      if (char === "\\") {
        rest += depth === 0 ? char + (text[index + 1] ?? "") : "";
        index += 1;
        continue;
      }
      quoted = char !== '"';
    } else if (char === '"') {
      quoted = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      continue;
    }
    if (depth === 0 && char !== "}") {
      rest += char;
    }
  }
  return strings(rest);
}

function field(table: string, key: string): string {
  const match = new RegExp(`(?:^|[,\\s])${key}\\s*=\\s*${string.source}`).exec(table);
  return match?.[1] === undefined ? "" : (JSON.parse(`"${match[1]}"`) as string);
}

/** Reads `[licenses] allow` and `[advisories] ignore` from the file text. */
export function readDeny(text: string): DenyReading {
  const allow = arrayOf(text, "licenses", "allow");
  const ignore = arrayOf(text, "advisories", "ignore");
  return {
    allow: allow === undefined ? undefined : strings(allow),
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
