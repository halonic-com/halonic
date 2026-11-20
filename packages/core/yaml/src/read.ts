import { err, ok, type Result } from "@halonicjs/std";
import {
  type Document,
  isMap,
  isScalar,
  LineCounter,
  type Node,
  parseDocument,
  visit,
  type YAMLError,
} from "yaml";
import { findDepthOffset } from "./depth.ts";
import type { SourcePosition, YamlProblem } from "./problem.ts";
import { findUnsupported, tooDeepMessage, unsupportedMessages } from "./unsupported.ts";

/** The keys and list indexes from the top of a file down to one value. */
export type YamlPath = readonly (string | number)[];

/** Limits that keep a hostile file from using up memory or the call stack. */
export interface YamlLimits {
  /** The most levels lists and maps may nest. */
  readonly maxDepth: number;
  /** The longest text, in UTF-16 code units (what `string.length` counts). */
  readonly maxLength: number;
}

/**
 * Generous for workspace files, which nest about ten levels and stay well
 * under a megabyte.
 */
export const defaultYamlLimits: YamlLimits = { maxDepth: 100, maxLength: 1_000_000 };

/** A YAML text that was read: its data, and where each value sits. */
export interface YamlFile {
  /**
   * The data, as plain objects, arrays, strings, numbers, booleans and
   * `null`. An empty file, or one with only comments, gives `null`.
   */
  readonly data: unknown;
  /**
   * Where the value at `path` starts. When nothing sits at `path`, the
   * nearest parent that exists answers instead. A missing key points at the
   * key of the map that should hold it (or at the map itself when it has no
   * key, like a list item or the top of the file). `undefined` only for a
   * file with no data at all.
   */
  positionOf(path: YamlPath): SourcePosition | undefined;
  /**
   * Where the key that names the value at `path` starts, such as `modle` in
   * `modle: smart`. Without such a key (a list item, a missing key) it
   * answers as {@link YamlFile.positionOf}.
   */
  positionOfKey(path: YamlPath): SourcePosition | undefined;
}

/**
 * Reads a workspace YAML file with the same YAML rules as the old app
 * (YAML 1.2 core schema, so `yes` stays text), and rejects what workspace
 * files may not use: anchors, aliases, tags, several documents and lists or
 * maps as keys.
 *
 * @param text - the whole file
 * @param limits - depth and length limits; the defaults suit workspace files
 * @returns the data and positions, or the first problem with its line and column
 *
 * @example
 * const read = readYaml("name: Billing\nsteps:\n  - id: check\n");
 * if (read.ok) read.value.positionOf(["steps", 0, "id"]); // { line: 3, col: 9 }
 */
export function readYaml(
  text: string,
  limits: YamlLimits = defaultYamlLimits,
): Result<YamlFile, YamlProblem> {
  if (text.length > limits.maxLength) {
    return err({
      kind: "too-large",
      message: `The file is ${text.length} characters long; the limit is ${limits.maxLength}.`,
      line: 1,
      col: 1,
    });
  }
  // Look at the nesting first: the yaml library builds the whole tree before
  // we could, and a hostile file can use up memory doing that.
  const tooDeepAt = findDepthOffset(text, limits.maxDepth);
  if (tooDeepAt !== undefined) {
    return err({
      kind: "too-deep",
      message: tooDeepMessage(limits.maxDepth),
      ...positionAtOffset(text, tooDeepAt),
    });
  }
  // The same options as the old app (784f78d, packages/core/config/src/workspace.ts).
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines, prettyErrors: false });

  const parseError = document.errors[0];
  if (parseError !== undefined) {
    return err({
      ...describeParseError(parseError, text, limits),
      ...parseErrorPosition(document, parseError, lines),
    });
  }

  const unsupported = findUnsupported(document.contents, limits.maxDepth);
  if (unsupported !== undefined) {
    return err({
      kind: unsupported.kind,
      message: unsupported.message,
      ...startOf(unsupported.node, lines),
    });
  }

  return ok({
    // Aliases are already rejected above; a limit of 0 keeps the library from
    // expanding one if that ever changes.
    data: document.toJS({ maxAliasCount: 0 }),
    positionOf: (path) => positionOf(document, lines, path),
    positionOfKey: (path) => {
      const key = path.length > 0 ? keyOf(document, path, path.length) : undefined;
      return key === undefined ? positionOf(document, lines, path) : startOf(key, lines);
    },
  });
}

/**
 * Plain words for the parser errors a new user meets most (HAL-14261). The
 * parser's own text follows the hint, so nothing is lost.
 */
const syntaxHints: Partial<Record<YAMLError["code"], string>> = {
  TAB_AS_INDENT: "Indent with spaces, not tabs.",
};

/**
 * The hint for a colon and a space inside a plain value, such as
 * `name: Writer: the one who writes`. The parser gives the same error for a
 * line indented too far under a value, so the hint only comes when the value
 * the error points at really has a `: ` in it.
 */
const colonInValueHint = 'A value has ": " in it. Put the value in quotes.';

/** The hint for a quote that never closes, which the parser reports as a missing character. */
const unclosedQuoteHint =
  "This quote is never closed. Add the closing quote at the end of the value.";

/**
 * Turns an error from the `yaml` library into our problem kinds. Two of its
 * errors get our own wording: a second document, and the call stack running
 * out on deep nesting (it catches that itself and reports it as
 * `RESOURCE_EXHAUSTION`). The common syntax errors get a plain hint first.
 */
function describeParseError(
  error: YAMLError,
  text: string,
  limits: YamlLimits,
): Pick<YamlProblem, "kind" | "message"> {
  switch (error.code) {
    case "MULTIPLE_DOCS":
      return { kind: "unsupported", message: unsupportedMessages.multipleDocuments };
    case "RESOURCE_EXHAUSTION":
      return { kind: "too-deep", message: tooDeepMessage(limits.maxDepth) };
    default: {
      // The old app showed only the first line of the message too.
      const parserText = firstLine(error.message);
      const hint = syntaxHintFor(error, text);
      return {
        kind: "syntax",
        message: hint === undefined ? parserText : `${hint} (YAML says: ${parserText})`,
      };
    }
  }
}

function syntaxHintFor(error: YAMLError, text: string): string | undefined {
  if (isUnclosedQuote(error)) {
    return unclosedQuoteHint;
  }
  if (error.code === "BLOCK_AS_IMPLICIT_KEY") {
    return valueHasColon(text, error.pos[0]) ? colonInValueHint : undefined;
  }
  return syntaxHints[error.code];
}

/** Whether the rest of the line from `offset`, the value the error points at, has a `: ` in it. */
function valueHasColon(text: string, offset: number): boolean {
  const lineEnd = text.indexOf("\n", offset);
  const rest = text.slice(offset, lineEnd === -1 ? undefined : lineEnd);
  return rest.includes(": ");
}

function isUnclosedQuote(error: YAMLError): boolean {
  return error.code === "MISSING_CHAR" && error.message.startsWith("Missing closing");
}

/**
 * Where a parse error points. The parser reports a quote that never closes
 * at the end of the file; the line the quote opens on is where to fix it.
 */
function parseErrorPosition(
  document: Document,
  error: YAMLError,
  lines: LineCounter,
): SourcePosition {
  const at = error.pos[0];
  if (isUnclosedQuote(error)) {
    const quoted = quotedValueEndingAt(document, at);
    if (quoted !== undefined) {
      return startOf(quoted, lines);
    }
  }
  const { line, col } = lines.linePos(at);
  return { line, col };
}

/** The quoted value that runs up to `offset`: an unclosed quote takes in the rest of the file. */
function quotedValueEndingAt(document: Document, offset: number): Node | undefined {
  let found: Node | undefined;
  visit(document, {
    Scalar(_, scalar) {
      const quoted = scalar.type === "QUOTE_SINGLE" || scalar.type === "QUOTE_DOUBLE";
      if (quoted && scalar.range?.[1] === offset) {
        found = scalar;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  return found;
}

/**
 * Ported from the old app's `sourcePosition`: tries the full path, then each
 * shorter one, then the top of the document. When a key is missing from a map
 * that is itself a value, the answer is that map's key, as in the old app's
 * parity cases: `run:` rather than the line below it.
 */
function positionOf(
  document: Document,
  lines: LineCounter,
  path: YamlPath,
): SourcePosition | undefined {
  for (let length = path.length; length >= 0; length--) {
    const node = length === 0 ? document.contents : document.getIn(path.slice(0, length), true);
    if (isNodeWithRange(node)) {
      const key = length < path.length && isMap(node) ? keyOf(document, path, length) : undefined;
      return startOf(key ?? node, lines);
    }
  }
  return undefined;
}

/** The key node that names the map at `path[0, length)`, if that map is a value in another map. */
function keyOf(document: Document, path: YamlPath, length: number): Node | undefined {
  const name = path[length - 1];
  const parent = length === 1 ? document.contents : document.getIn(path.slice(0, length - 1), true);
  if (!isMap(parent)) {
    return undefined;
  }
  const pair = parent.items.find((item) => isScalar(item.key) && item.key.value === name);
  return isNodeWithRange(pair?.key) ? pair.key : undefined;
}

function isNodeWithRange(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "range" in value && value.range != null;
}

function startOf(node: Node, lines: LineCounter): SourcePosition {
  // Every node the parser makes has a range; only nodes built in code lack one.
  const start = node.range?.[0] ?? 0;
  const { line, col } = lines.linePos(start);
  return { line, col };
}

/** The line and column of a character offset, counting lines like the parser. */
function positionAtOffset(text: string, offset: number): SourcePosition {
  let line = 1;
  let lineStart = 0;
  for (let at = text.indexOf("\n"); at !== -1 && at < offset; at = text.indexOf("\n", at + 1)) {
    line++;
    lineStart = at + 1;
  }
  return { line, col: offset - lineStart + 1 };
}

function firstLine(message: string): string {
  const end = message.indexOf("\n");
  return end === -1 ? message : message.slice(0, end);
}
