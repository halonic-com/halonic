import { err, ok, type Result } from "@halonicjs/std";
import { type Document, LineCounter, type Node, parseDocument, type YAMLError } from "yaml";
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
export const defaultYamlLimits: YamlLimits = { maxDepth: 100, maxLength: 5_000_000 };

/** A YAML text that was read: its data, and where each value sits. */
export interface YamlFile {
  /**
   * The data, as plain objects, arrays, strings, numbers, booleans and
   * `null`. An empty file, or one with only comments, gives `null`.
   */
  readonly data: unknown;
  /**
   * Where the value at `path` starts. When nothing sits at `path`, the
   * nearest parent that exists answers instead, so a missing key points at
   * its map. `undefined` only for a file with no data at all.
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
    data: document.toJS(),
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
 * shorter one, then the top of the document.
 */
function positionOf(
  document: Document,
  lines: LineCounter,
  path: YamlPath,
): SourcePosition | undefined {
  for (let length = path.length; length >= 0; length--) {
    const node = length === 0 ? document.contents : document.getIn(path.slice(0, length), true);
    if (isNodeWithRange(node)) {
      return startOf(node, lines);
    }
  }
  return undefined;
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

function firstLine(message: string): string {
  const end = message.indexOf("\n");
  return end === -1 ? message : message.slice(0, end);
}
