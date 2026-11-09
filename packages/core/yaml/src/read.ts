import { err, ok, type Result } from "@halonicjs/std";
import {
  type Document,
  isMap,
  isScalar,
  LineCounter,
  type Node,
  parseDocument,
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
    return err({ ...describeParseError(parseError, limits), ...lines.linePos(parseError.pos[0]) });
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
  });
}

/**
 * Turns an error from the `yaml` library into our problem kinds. Two of its
 * errors get our own wording: a second document, and the call stack running
 * out on deep nesting (it catches that itself and reports it as
 * `RESOURCE_EXHAUSTION`).
 */
function describeParseError(
  error: YAMLError,
  limits: YamlLimits,
): Pick<YamlProblem, "kind" | "message"> {
  switch (error.code) {
    case "MULTIPLE_DOCS":
      return { kind: "unsupported", message: unsupportedMessages.multipleDocuments };
    case "RESOURCE_EXHAUSTION":
      return { kind: "too-deep", message: tooDeepMessage(limits.maxDepth) };
    default:
      // The old app showed only the first line of the message too.
      return { kind: "syntax", message: firstLine(error.message) };
  }
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
