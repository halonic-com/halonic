import { err, ok, type Result } from "@halonicjs/std";
import { readYaml, type SourcePosition, type YamlPath, type YamlProblem } from "@halonicjs/yaml";
import type { KindSyntax } from "./kind.ts";
import { isMap } from "./shared/legacy-keys.ts";

/** A file's text, read into data, with where each value sits. */
export interface Source {
  /** The data: a map for a well-formed file; `{}` for an empty one, as the old loader read it. */
  readonly data: unknown;
  /** Where the value at `path` starts, or the nearest parent; line 1, column 1 when nothing does. */
  positionOf(path: YamlPath): SourcePosition;
}

const fileStart: SourcePosition = { line: 1, col: 1 };

/**
 * Reads a file's text in its kind's syntax.
 *
 * @returns the data and positions, or the YAML problem with its line in the file
 */
export function readSource(syntax: KindSyntax, text: string): Result<Source, YamlProblem> {
  if (syntax === "front-matter") {
    return readFrontMatterFile(text);
  }
  const read = readYaml(text);
  if (!read.ok) {
    return read;
  }
  const file = read.value;
  return ok({
    data: file.data ?? {},
    positionOf: (path) => file.positionOf(path) ?? fileStart,
  });
}

// The old loader's pattern (784f78d: parseSkillMarkdown): `---`, the YAML,
// `---`, then the body.
const frontMatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Reads a Markdown file with YAML front matter, such as `SKILL.md`. The data
 * is the front matter plus `body`, the Markdown after it, trimmed. Without
 * front matter the data is only `body`, the whole text untrimmed, as before.
 */
function readFrontMatterFile(text: string): Result<Source, YamlProblem> {
  const match = frontMatterPattern.exec(text);
  if (match === null) {
    return ok({ data: { body: text }, positionOf: () => fileStart });
  }
  const frontMatterText = match[1] ?? "";
  const body = match[2] ?? "";
  // The front matter starts on line 2, below the opening `---`.
  const lineOffset = 1;
  const read = readYaml(frontMatterText);
  if (!read.ok) {
    return err({ ...read.error, line: read.error.line + lineOffset });
  }
  const frontMatter = read.value;
  const bodyPosition: SourcePosition = {
    line: lineCount(text.slice(0, text.length - body.length)),
    col: 1,
  };
  const data = frontMatter.data ?? {};
  return ok({
    data: isMap(data) ? { ...data, body: body.trim() } : data,
    positionOf: (path) => {
      if (path[0] === "body") {
        return bodyPosition;
      }
      const position = frontMatter.positionOf(path);
      return position === undefined
        ? fileStart
        : { line: position.line + lineOffset, col: position.col };
    },
  });
}

/** The 1-based number of the line a text ends on. */
function lineCount(text: string): number {
  let lines = 1;
  for (const character of text) {
    if (character === "\n") {
      lines += 1;
    }
  }
  return lines;
}
