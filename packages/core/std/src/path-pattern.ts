// Path patterns as `.gitignore` writes them (https://git-scm.com/docs/gitignore),
// read by our own code, so a tool can honour a repo's ignore files without
// starting git. Starting git in a repo runs whatever the repo's own git config
// names, such as `core.fsmonitor` (HAL-16748).

/** One pattern line of an ignore file, ready to match. */
export interface PathPattern {
  /** `true` for a `!` line, which takes a path back out of the ignored ones. */
  readonly negated: boolean;
  /** `true` for a line ending in `/`, which matches only folders. */
  readonly folderOnly: boolean;
  /**
   * Whether the pattern matches `path`: relative to the folder of the file
   * the pattern is in, with `/`, and without a leading or trailing `/`.
   */
  matches(path: string): boolean;
}

/**
 * Reads one line of an ignore file as Git does: `null` for a blank line or a
 * `#` comment. A leading `!` negates it, a trailing `/` makes it match only
 * folders, and a `\` takes the next character as it is (`\#`, `\!`, `\ `).
 * A pattern with a `/` before its end matches from the file's folder; one
 * without matches a name at any depth. `*` and `?` stay within one name,
 * `[a-z]` and `[!a-z]` match one character of a set, and `**` matches any
 * number of folders when it is a whole part of the path (at the start, at the
 * end, or between two `/`).
 *
 * @example
 * readPathPattern("/dist/")?.matches("dist"); // true; and `folderOnly` is true
 * readPathPattern("*.log")?.matches("logs/today.log"); // true
 */
export function readPathPattern(line: string): PathPattern | null {
  let text = withoutTrailingSpaces(line);
  if (text === "" || text.startsWith("#")) return null;
  const negated = text.startsWith("!");
  if (negated) text = text.slice(1);
  const folderOnly = text.endsWith("/") && !text.endsWith("\\/");
  if (folderOnly) text = text.slice(0, -1);
  if (text === "") return null;
  const anchored = text.slice(0, -1).includes("/");
  if (text.startsWith("/")) text = text.slice(1);
  const pattern = patternOf(globSource(text), anchored);
  if (pattern === null) return null;
  return { negated, folderOnly, matches: (path) => pattern.test(path) };
}

/**
 * The expression for a glob's source, or `null` for one that isn't valid,
 * such as a set `[z-a]`; Git skips such a line too.
 */
function patternOf(body: string, anchored: boolean): RegExp | null {
  try {
    return new RegExp(anchored ? `^${body}$` : `(?:^|/)${body}$`);
  } catch {
    return null;
  }
}

/** Every pattern line of an ignore file's text, in order. */
export function readIgnoreFile(text: string): PathPattern[] {
  return text
    .split(/\r?\n/)
    .map(readPathPattern)
    .filter((pattern) => pattern !== null);
}

/**
 * What a list of patterns says about `path`, as Git decides it: the last
 * pattern that matches wins. `true` when that one ignores the path, `false`
 * when a `!` line takes it back, and `undefined` when none matches, so a
 * caller can ask the ignore file of the folder above next.
 *
 * @param path - relative to the folder of the file the patterns come from, with `/`
 * @param isFolder - whether the path is a folder, for the patterns that end in `/`
 */
export function ignoredByPatterns(
  patterns: readonly PathPattern[],
  path: string,
  isFolder: boolean,
): boolean | undefined {
  for (const pattern of patterns.toReversed()) {
    if (pattern.folderOnly && !isFolder) continue;
    if (pattern.matches(path)) return !pattern.negated;
  }
  return undefined;
}

/** The line without its trailing spaces, keeping a space escaped with `\`. */
function withoutTrailingSpaces(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === " " && line[end - 2] !== "\\") end -= 1;
  return line.slice(0, end);
}

/** The regular expression source for a glob, without anchors. */
function globSource(glob: string): string {
  let source = "";
  let at = 0;
  while (at < glob.length) {
    const [part, length] = globPart(glob, at);
    source += part;
    at += length;
  }
  return source;
}

/** The source for the glob part that starts at `at`, and how many characters it takes. */
function globPart(glob: string, at: number): [string, number] {
  const character = glob.charAt(at);
  if (glob.startsWith("**", at)) return doubleStar(glob, at);
  if (character === "*") return ["[^/]*", 1];
  if (character === "?") return ["[^/]", 1];
  if (character === "[") return characterSet(glob, at);
  if (character === "\\" && at + 1 < glob.length) return [escaped(glob.charAt(at + 1)), 2];
  return [escaped(character), 1];
}

// `**` as a whole part: any folders before it at the start, anything inside
// at the end, or any folders between two `/`. Elsewhere it is a plain `*`.
function doubleStar(glob: string, at: number): [string, number] {
  const startsPart = at === 0 || glob.charAt(at - 1) === "/";
  const next = glob.charAt(at + 2);
  if (startsPart && next === "/") return ["(?:.*/)?", 3];
  if (startsPart && next === "") return [".*", 2];
  return ["[^/]*", 2];
}

/** A `[...]` set, or a plain `[` when it never closes. */
function characterSet(glob: string, at: number): [string, number] {
  const close = glob.indexOf("]", at + 2);
  if (close === -1) return [escaped("["), 1];
  let inside = glob.slice(at + 1, close);
  const negated = inside.startsWith("!") || inside.startsWith("^");
  if (negated) inside = inside.slice(1);
  const members = inside.replaceAll("\\", "\\\\").replaceAll("]", "\\]").replaceAll("[", "\\[");
  return [`${negated ? "[^/" : "["}${members}]`, close - at + 1];
}

function escaped(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}
