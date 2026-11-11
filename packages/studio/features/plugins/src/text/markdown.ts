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
  const item = BULLET.test(line) || NUMBERED.test(line);
  if (kind === "quote") return !quote;
  if (kind === "list") return quote;
  return quote || item;
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
 * @param source - the block's text
 */
export function readInline(source: string): Inline[] {
  const parts: Inline[] = [];
  let text = "";
  let at = 0;
  const push = (part: Inline) => {
    if (text !== "") parts.push({ kind: "text", text });
    text = "";
    parts.push(part);
  };
  while (at < source.length) {
    const found = inlineAt(source, at);
    if (found === null) {
      // An escape keeps the next character as text, so `\*` is a star.
      const escaped = source[at] === "\\" && /[!-/:-@[-`{-~]/.test(source[at + 1] ?? "");
      text += escaped ? source[at + 1] : source[at];
      at += escaped ? 2 : 1;
    } else {
      push(found.part);
      at = found.end;
    }
  }
  if (text !== "") parts.push({ kind: "text", text });
  return parts;
}

type Found = { part: Inline; end: number } | null;

/** The inline part that starts at `at`, or `null` when the character there is text. */
function inlineAt(source: string, at: number): Found {
  const rest = source.slice(at);
  for (const read of [codeAt, emphasisAt, imageAt, linkAt]) {
    const found = read(source, at, rest);
    if (found !== null) return found;
  }
  return null;
}

function codeAt(_source: string, at: number, rest: string): Found {
  const code = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(rest);
  return code === null
    ? null
    : { part: { kind: "code", text: code[2] ?? "" }, end: at + code[0].length };
}

function emphasisAt(source: string, at: number, rest: string): Found {
  if (!opensEmphasis(source, at)) return null;
  const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
  if (strong !== null) {
    const children = readInline(strong[2] ?? "");
    return { part: { kind: "strong", children }, end: at + strong[0].length };
  }
  const em = /^([*_])(?=[^\s*_])([\s\S]*?[^\s\\])\1(?![*_])/.exec(rest);
  if (em === null) return null;
  return { part: { kind: "em", children: readInline(em[2] ?? "") }, end: at + em[0].length };
}

/** `![alt](src)` is an image: it never reaches the link rule, so it stays text. */
function imageAt(_source: string, at: number, rest: string): Found {
  const image = /^!\[[^\]\n]*\]\([^)\s]*\)/.exec(rest);
  return image === null
    ? null
    : { part: { kind: "text", text: image[0] }, end: at + image[0].length };
}

function linkAt(_source: string, at: number, rest: string): Found {
  const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
  if (link === null || !isWebAddress(link[2] ?? "")) return null;
  return {
    part: { kind: "link", href: link[2] ?? "", text: link[1] ?? "" },
    end: at + link[0].length,
  };
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
