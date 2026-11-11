// The Markdown a plugin's result may use (`plugins.plugin-text`). It reads a
// fixed set of elements into plain data, and everything else stays text:
// HTML, images, tables, nested lists and links to anything but a web page.
// The screens draw the data with React, so no string ever becomes markup.

/** A run of text inside a block. */
export type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly children: readonly Inline[] }
  | { readonly kind: "em"; readonly children: readonly Inline[] }
  | { readonly kind: "code"; readonly text: string }
  /** Only for an `http` or `https` address; its text is plain. */
  | { readonly kind: "link"; readonly href: string; readonly text: string };

/** A block of a result. A heading is a bold line, so a plugin can't add to the page's outline. */
export type Block =
  | { readonly kind: "paragraph"; readonly inlines: readonly Inline[] }
  | { readonly kind: "heading"; readonly inlines: readonly Inline[] }
  | { readonly kind: "quote"; readonly inlines: readonly Inline[] }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly Inline[][] }
  | { readonly kind: "code"; readonly text: string };

const HEADING = /^ {0,3}#{1,6}(?:\s+|$)/;
const QUOTE = /^ {0,3}> ?/;
const BULLET = /^ {0,3}[-*+]\s+/;
const NUMBERED = /^ {0,3}\d{1,9}[.)]\s+/;
/** Only a list that starts at 1 ends a paragraph, so a line like `2024. Next` doesn't. */
const FIRST_NUMBERED = /^ {0,3}1[.)]\s+/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Reads a plugin's Markdown result into blocks. Lines inside a paragraph keep
 * their line breaks.
 *
 * @param source - the tool's answer
 * @example
 * readMarkdown("# Today\n**Sunny**, 21 °C");
 * // [{ kind: "heading", inlines: [text "Today"] },
 * //  { kind: "paragraph", inlines: [strong "Sunny", text ", 21 °C"] }]
 */
export function readMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const { block, next } = blockAt(lines, index);
    if (block !== null) blocks.push(block);
    index = next;
  }
  return blocks;
}

/** The block that starts at line `index`, if any, and the line after it. */
function blockAt(lines: readonly string[], index: number): { block: Block | null; next: number } {
  const line = lines[index] ?? "";
  if (line.trim() === "") return { block: null, next: index + 1 };
  const fence = FENCE.exec(line);
  if (fence !== null) {
    const marker = fence[1] ?? "";
    const end = lines.findIndex((next, at) => at > index && next.trim().startsWith(marker));
    const stop = end === -1 ? lines.length : end;
    return {
      block: { kind: "code", text: lines.slice(index + 1, stop).join("\n") },
      next: stop + 1,
    };
  }
  if (HEADING.test(line)) {
    const inlines = readInline(line.replace(HEADING, "").trim());
    return { block: { kind: "heading", inlines }, next: index + 1 };
  }
  const kind = runKind(line);
  const run = takeRun(lines, index, kind);
  return { block: toBlock(kind, run), next: index + run.length };
}

type RunKind = "quote" | "list" | "paragraph";

function runKind(line: string): RunKind {
  if (QUOTE.test(line)) return "quote";
  return BULLET.test(line) || NUMBERED.test(line) ? "list" : "paragraph";
}

/** The lines from `start` that belong to one block of `kind`. */
function takeRun(lines: readonly string[], start: number, kind: RunKind): string[] {
  const run: string[] = [];
  for (let at = start; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    if (line.trim() === "" || (at > start && startsOtherBlock(line, kind))) break;
    run.push(line);
  }
  return run;
}

function startsOtherBlock(line: string, kind: RunKind): boolean {
  if (FENCE.test(line) || HEADING.test(line)) return true;
  const quote = QUOTE.test(line);
  if (kind === "quote") return !quote;
  if (kind === "list") return quote;
  return quote || BULLET.test(line) || FIRST_NUMBERED.test(line);
}

function toBlock(kind: RunKind, run: readonly string[]): Block {
  if (kind === "quote") {
    return { kind, inlines: readInline(run.map((line) => line.replace(QUOTE, "")).join("\n")) };
  }
  if (kind === "paragraph") {
    return { kind, inlines: readInline(run.map((line) => line.trim()).join("\n")) };
  }
  // A line that isn't an item continues the item above it.
  const ordered = NUMBERED.test(run[0] ?? "");
  const items: string[] = [];
  for (const line of run) {
    const marker = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (marker === null) items[items.length - 1] += `\n${line.trim()}`;
    else items.push(line.slice(marker[0].length));
  }
  return { kind, ordered, items: items.map((item) => readInline(item)) };
}

/**
 * Reads the inline parts of one block: `code`, **strong**, *em* or _em_,
 * [links](https://…) and `\` escapes. An image, a link to anything but a web
 * page, and any HTML stay as their own characters.
 *
 * Its time grows in step with the block's length, even when markers never
 * close (HAL-4978): every search for a closing marker remembers its answer,
 * so no stretch of text is searched twice.
 *
 * @param source - the block's text
 */
export function readInline(source: string): Inline[] {
  const reader = readerOf(source);
  const parts: Inline[] = [];
  let text = "";
  let at = 0;
  while (at < source.length) {
    const { part, end } = inlineAt(reader, at);
    at = end;
    if (part.kind === "text") {
      text += part.text;
      continue;
    }
    if (text !== "") parts.push({ kind: "text", text });
    text = "";
    parts.push(part);
  }
  if (text !== "") parts.push({ kind: "text", text });
  return parts;
}

type Found = { part: Inline; end: number } | null;

/**
 * What ends each part. For emphasis the match starts at the content's last
 * character; for a link it is the `]` after its text or the `)` after its address.
 */
const CLOSERS = {
  "**": /\S\*\*/g,
  __: /\S__/g,
  "*": /[^\s\\]\*(?![*_])/g,
  _: /[^\s\\]_(?![*_])/g,
  "]": /[\]\n]/g,
  ")": /[)\s]/g,
} as const;

type Closer = keyof typeof CLOSERS;

/** One block's text and the searches over it. */
interface Reader {
  readonly source: string;
  /** The first match of the closer at or after `from`, or -1. */
  readonly find: (closer: Closer, from: number) => number;
  /** The first run of exactly `size` backticks that starts at or after `from`, or -1. */
  readonly backticks: (size: number, from: number) => number;
}

/**
 * The searches for one block. `readInline` only ever asks from the same place
 * or further on, so a search that found its match at `found` answers every
 * later one that starts at or before `found`, and one that found nothing
 * answers all of them.
 */
function readerOf(source: string): Reader {
  const last = new Map<Closer, { pattern: RegExp; from: number; found: number }>();
  let runs: Map<number, { starts: number[]; next: number }> | null = null;
  return {
    source,
    find(closer, from) {
      const known = last.get(closer);
      if (
        known !== undefined &&
        from >= known.from &&
        (known.found === -1 || from <= known.found)
      ) {
        return known.found;
      }
      const pattern = known?.pattern ?? new RegExp(CLOSERS[closer]);
      pattern.lastIndex = from;
      const found = pattern.exec(source)?.index ?? -1;
      last.set(closer, { pattern, from, found });
      return found;
    },
    backticks(size, from) {
      runs ??= backtickRuns(source);
      const run = runs.get(size);
      if (run === undefined) return -1;
      while ((run.starts[run.next] ?? Number.POSITIVE_INFINITY) < from) run.next += 1;
      return run.starts[run.next] ?? -1;
    },
  };
}

/** Where every run of backticks starts, by its length, in one pass. */
function backtickRuns(source: string): Map<number, { starts: number[]; next: number }> {
  const runs = new Map<number, { starts: number[]; next: number }>();
  for (const match of source.matchAll(/`+/g)) {
    const run = runs.get(match[0].length) ?? { starts: [], next: 0 };
    run.starts.push(match.index);
    runs.set(match[0].length, run);
  }
  return runs;
}

/** The inline part that starts at `at`; text when nothing starts there. */
function inlineAt(reader: Reader, at: number): NonNullable<Found> {
  for (const read of [codeAt, emphasisAt, imageAt, linkAt]) {
    const found = read(reader, at);
    if (found !== null) return found;
  }
  // An escape keeps the next character as text, so `\*` is a star.
  const { source } = reader;
  const escaped = source[at] === "\\" && /[!-/:-@[-`{-~]/.test(source[at + 1] ?? "");
  const char = escaped ? (source[at + 1] ?? "") : (source[at] ?? "");
  return { part: { kind: "text", text: char }, end: at + (escaped ? 2 : 1) };
}

/** A run of backticks with no run of the same length after it is text, all of it. */
function codeAt({ source, backticks }: Reader, at: number): Found {
  if (source[at] !== "`") return null;
  let size = 1;
  while (source[at + size] === "`") size += 1;
  // The content is at least one character, so the closing run starts after it.
  const close = backticks(size, at + size + 1);
  if (close === -1) return { part: { kind: "text", text: "`".repeat(size) }, end: at + size };
  return { part: { kind: "code", text: source.slice(at + size, close) }, end: close + size };
}

function emphasisAt(reader: Reader, at: number): Found {
  const { source } = reader;
  const marker = source[at];
  if ((marker !== "*" && marker !== "_") || !opensEmphasis(source, at)) return null;
  if (source[at + 1] === marker && /\S/.test(source[at + 2] ?? "")) {
    const last = reader.find(marker === "*" ? "**" : "__", at + 2);
    if (last !== -1) {
      const children = readInline(source.slice(at + 2, last + 1));
      return { part: { kind: "strong", children }, end: last + 3 };
    }
  }
  if (!/[^\s*_]/.test(source[at + 1] ?? "")) return null;
  const last = reader.find(marker, at + 1);
  if (last === -1) return null;
  return {
    part: { kind: "em", children: readInline(source.slice(at + 1, last + 1)) },
    end: last + 2,
  };
}

/** `![alt](src)` is an image: it never reaches the link rule, so it stays text. */
function imageAt(reader: Reader, at: number): Found {
  if (reader.source[at] !== "!") return null;
  const image = bracketsAt(reader, at + 1);
  return image === null
    ? null
    : { part: { kind: "text", text: reader.source.slice(at, image.end) }, end: image.end };
}

function linkAt(reader: Reader, at: number): Found {
  const link = bracketsAt(reader, at);
  if (link === null || link.text === "" || link.href === "" || !isWebAddress(link.href))
    return null;
  return { part: { kind: "link", href: link.href, text: link.text }, end: link.end };
}

/** `[text](href)` at `at`, with no line break in the text and no space in the address. */
function bracketsAt(
  reader: Reader,
  at: number,
): { text: string; href: string; end: number } | null {
  const { source } = reader;
  if (source[at] !== "[") return null;
  const close = reader.find("]", at + 1);
  if (source[close] !== "]" || source[close + 1] !== "(") return null;
  const end = reader.find(")", close + 2);
  if (source[end] !== ")") return null;
  return { text: source.slice(at + 1, close), href: source.slice(close + 2, end), end: end + 1 };
}

/** `snake_case_names` and `2*3*4` stay text: emphasis starts only after a space or punctuation. */
function opensEmphasis(source: string, at: number): boolean {
  return at === 0 || !/[\p{L}\p{N}]/u.test(source[at - 1] ?? "");
}

// The same rule as the kit's ExternalLink, which throws on anything else.
function isWebAddress(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
