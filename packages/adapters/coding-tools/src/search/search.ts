import { readFile, stat } from "node:fs/promises";
import { type PathPattern, readPathPattern } from "@halonicjs/std";
import { cutLine, maxAnswerCharacters } from "../answer-cap.ts";
import { AnswerBudget, type CodingTool } from "../coding-tool.ts";
import { type AllowedPath, allowedPath, type ToolFolders } from "../folders.ts";
import { looksBinary, textLines } from "../read/text-file.ts";
import {
  optionalFlag,
  optionalInteger,
  optionalText,
  refuseUnknownArguments,
  requiredText,
  type ToolArguments,
  ToolRefusal,
} from "../tool-input.ts";
import { FileWalk } from "./file-walk.ts";
import { MatchTimeoutError, TimedLineMatcher } from "./regex-match.ts";

/** The search's limits (HAL-16737, plan section 5). */
const limits = {
  matchesPerFile: 30,
  matches: 200,
  columns: 300,
  /** Larger files are left out. */
  fileBytes: 2 * 1024 * 1024,
  /** How long a regular expression may take on one file. */
  fileMatchMs: 1_000,
  /** How long one search may take in all. */
  searchMs: 20_000,
} as const;

/** Room kept for the closing note. */
const noteRoom = 400;

/** Finds the matching lines' indexes, up to a limit. */
type LineTest = (lines: readonly string[], limit: number) => number[];

/** What one search asks for. */
interface SearchRequest {
  readonly test: LineTest;
  readonly glob: PathPattern | null;
  readonly context: number;
}

const description =
  "Search the files in the working folder for a text (or, with regex: true, a JavaScript regular expression): " +
  "matching lines with their line numbers and a few lines around them. Use it before reading, to read only the ranges you need. " +
  "Skips what .gitignore ignores, node_modules, binary files and files over 2 MB.";

/**
 * `search` (requirement `coding-tools.search`): a text or a regular
 * expression in the working folder's files, in our own code on every
 * system, without git or ripgrep.
 */
export function searchTool(folders: ToolFolders): CodingTool {
  return {
    definition: {
      name: "search",
      description,
      inputSchema: {
        type: "object",
        required: ["pattern"],
        additionalProperties: false,
        properties: {
          pattern: { type: "string" },
          regex: { type: "boolean", description: "Read the pattern as a regular expression." },
          ignoreCase: { type: "boolean" },
          path: {
            type: "string",
            description: "A file or folder to search in; the whole working folder by default.",
          },
          glob: {
            type: "string",
            description: "Only files whose path matches, such as *.ts or src/**/*.tsx.",
          },
          context: {
            type: "integer",
            minimum: 0,
            maximum: 8,
            description: "Lines around each match; 2 by default.",
          },
        },
      },
    },
    readOnly: true,
    async run(args, signal) {
      refuseUnknownArguments(args, ["pattern", "regex", "ignoreCase", "path", "glob", "context"]);
      const request = searchRequest(args);
      const start = await allowedPath(
        optionalText(args, "path", 4_096) ?? ".",
        folders,
        "working-folder",
      );
      return search(start, request, folders, signal);
    },
  };
}

/** Searches and writes the answer. */
async function search(
  start: AllowedPath,
  request: SearchRequest,
  folders: ToolFolders,
  signal: AbortSignal,
): Promise<string> {
  const answer = new SearchAnswer(request.context);
  const walk = new FileWalk(folders);
  const deadline = Date.now() + limits.searchMs;
  const isFile = (await stat(start.real)).isFile();
  const files = isFile ? [{ path: start.shown, real: start.real }] : walk.files(start.real);
  for await (const file of files) {
    if (signal.aborted || answer.full) break;
    if (Date.now() > deadline)
      return answer.text(
        `search stopped after ${limits.searchMs / 1_000} s; narrow it with path or glob`,
      );
    if (request.glob !== null && !request.glob.matches(file.path)) continue;
    const lines = await searchableLines(file.real);
    if (lines === null) continue;
    answer.addFile(file.path, lines, request.test(lines, limits.matchesPerFile + 1));
  }
  if (walk.stoppedEarly)
    return answer.text("the folder has too many files; narrow it with path or glob");
  return answer.text(null);
}

/** The file's lines, or `null` for a file the search leaves out: too large, binary or gone. */
async function searchableLines(real: string): Promise<string[] | null> {
  try {
    if ((await stat(real)).size > limits.fileBytes) return null;
    const bytes = await readFile(real);
    return looksBinary(bytes) ? null : textLines(bytes.toString("utf8"));
  } catch {
    // Removed or denied since the walk listed it: there is nothing in it to find.
    return null;
  }
}

/**
 * What the call asks for.
 *
 * @throws {ToolRefusal} for a regular expression or a glob that isn't valid
 */
function searchRequest(args: ToolArguments): SearchRequest {
  const pattern = requiredText(args, "pattern", 1_000);
  const ignoreCase = optionalFlag(args, "ignoreCase");
  const test = optionalFlag(args, "regex")
    ? regexTest(pattern, ignoreCase)
    : textTest(pattern, ignoreCase);
  const globText = optionalText(args, "glob", 500);
  const glob = globText === undefined ? null : readPathPattern(globText);
  if (globText !== undefined && glob === null) {
    throw new ToolRefusal(`'glob' isn't a pattern a file can match: ${globText}`);
  }
  const context = optionalInteger(args, "context", { min: 0, max: 8 }) ?? 2;
  return { test, glob, context };
}

/** A plain text search. */
function textTest(pattern: string, ignoreCase: boolean): LineTest {
  const wanted = ignoreCase ? pattern.toLowerCase() : pattern;
  return (lines, limit) => {
    const found: number[] = [];
    for (let index = 0; index < lines.length && found.length < limit; index += 1) {
      const line = lines[index] ?? "";
      if ((ignoreCase ? line.toLowerCase() : line).includes(wanted)) found.push(index);
    }
    return found;
  };
}

/** A regular expression search, with a time limit on each file. */
function regexTest(pattern: string, ignoreCase: boolean): LineTest {
  let expression: RegExp;
  try {
    expression = new RegExp(pattern, ignoreCase ? "i" : "");
  } catch (error) {
    throw new ToolRefusal(
      `'pattern' isn't a valid regular expression: ${(error as Error).message}`,
    );
  }
  const matcher = new TimedLineMatcher();
  return (lines, limit) => {
    try {
      return matcher.matchingLines(lines, expression, limit, limits.fileMatchMs);
    } catch (error) {
      if (!(error instanceof MatchTimeoutError)) throw error;
      throw new ToolRefusal(
        "The regular expression took too long on one file and was stopped. Simplify it: nested repeats such as (a+)+ can run for ever.",
      );
    }
  };
}

/** The search's answer, as ripgrep writes it: `path`, then `line:text` for a match and `line-text` around it. */
class SearchAnswer {
  readonly #budget = new AnswerBudget(maxAnswerCharacters - noteRoom);
  readonly #context: number;
  #matches = 0;
  #files = 0;

  constructor(context: number) {
    this.#context = context;
  }

  /** Whether the answer has reached the match limit or its size. */
  get full(): boolean {
    return this.#budget.full || this.#matches >= limits.matches;
  }

  /** Adds one file's matches, with the lines around them. */
  addFile(path: string, lines: readonly string[], found: readonly number[]): void {
    if (found.length === 0) return;
    const shownMatches = found.slice(
      0,
      Math.min(limits.matchesPerFile, limits.matches - this.#matches),
    );
    this.#files += 1;
    this.#matches += shownMatches.length;
    this.#budget.add(this.#files === 1 ? path : `\n${path}`);
    let lastShown = -1;
    for (const index of shownMatches) {
      const from = Math.max(0, index - this.#context, lastShown + 1);
      if (lastShown >= 0 && from > lastShown + 1) this.#budget.add("--");
      const to = Math.min(lines.length - 1, index + this.#context);
      for (let at = from; at <= to; at += 1) {
        const mark = shownMatches.includes(at) ? ":" : "-";
        this.#budget.add(`${at + 1}${mark}${cutLine(lines[at] ?? "", limits.columns)}`);
      }
      lastShown = Math.max(lastShown, to);
    }
    if (found.length > shownMatches.length)
      this.#budget.add("… more matches in this file; narrow the pattern or the path");
  }

  /** The answer, with a note when it was cut short. */
  text(stopped: string | null): string {
    if (this.#files === 0) return stopped === null ? "(no matches)" : `(no matches; ${stopped})`;
    const reason =
      stopped ?? (this.full ? "the answer is full; narrow it with path or glob" : null);
    const summary = `${this.#matches} matches in ${this.#files} files`;
    return `${this.#budget.text()}\n\n${reason === null ? summary : `${summary}; ${reason}`}`;
  }
}
