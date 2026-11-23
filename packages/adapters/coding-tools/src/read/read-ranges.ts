import { isPlainObject } from "@halonicjs/std";
import { cutLine, lineRange, maxAnswerCharacters } from "../answer-cap.ts";
import { AnswerBudget, type CodingTool } from "../coding-tool.ts";
import { allowedFile, type ToolFolders } from "../folders.ts";
import {
  optionalFlag,
  optionalInteger,
  refuseUnknownArguments,
  requiredText,
  type ToolArguments,
  ToolRefusal,
} from "../tool-input.ts";
import { type LineSpan, ReadCache } from "./read-cache.ts";
import { readTextFile, type TextFile } from "./text-file.ts";

/** The most files one call reads. */
const maxFiles = 20;

/** The lines a file gives when the call names no end. */
const defaultLines = 400;

/** The largest file read: a test log can be this big (see `run_tests`). */
export const maxReadBytes = 8 * 1024 * 1024;

/** Room kept for the note that says what didn't fit. */
const noteRoom = 400;

/** One file the call asks for, with its lines. */
interface FileRequest {
  readonly path: string;
  readonly start: number | undefined;
  readonly end: number | undefined;
}

const description =
  "Read several files or line ranges in ONE call, instead of many small reads. Lines are numbered. " +
  `Ranges are inclusive; without an end you get ${defaultLines} lines from the start. ` +
  "A range you already read, of a file that hasn't changed, isn't sent again: set fresh to true if you no longer have it.";

/**
 * `read_ranges` (requirement `coding-tools.read-ranges`): up to
 * {@link maxFiles} files or line ranges in one call, numbered, through
 * the read cache.
 */
export function readRangesTool(
  folders: ToolFolders,
  cache: ReadCache = new ReadCache(),
): CodingTool {
  return {
    definition: {
      name: "read_ranges",
      description,
      inputSchema: {
        type: "object",
        required: ["files"],
        additionalProperties: false,
        properties: {
          files: {
            type: "array",
            minItems: 1,
            maxItems: maxFiles,
            items: {
              type: "object",
              required: ["path"],
              additionalProperties: false,
              properties: {
                path: { type: "string", description: "Relative to the working folder." },
                start: { type: "integer", minimum: 1 },
                end: { type: "integer", minimum: 1 },
              },
            },
          },
          fresh: { type: "boolean", description: "Send every line, even ones sent before." },
        },
      },
    },
    readOnly: true,
    async run(args) {
      refuseUnknownArguments(args, ["files", "fresh"]);
      const requests = fileRequests(args["files"]);
      const fresh = optionalFlag(args, "fresh");
      const answer = new AnswerBudget(maxAnswerCharacters - noteRoom);
      for (const [index, request] of requests.entries()) {
        const cut = await readOne(request, { folders, cache, fresh, answer });
        if (cut !== null) return `${answer.text()}\n${notSentNote(cut, requests.slice(index + 1))}`;
      }
      return answer.text();
    },
  };
}

/** What reading one file needs. */
interface ReadContext {
  readonly folders: ToolFolders;
  readonly cache: ReadCache;
  readonly fresh: boolean;
  readonly answer: AnswerBudget;
}

/** Where the answer filled up: the file and the lines of it not sent. */
interface AnswerCut {
  readonly shown: string;
  readonly from: number;
  readonly to: number;
}

/** Adds one file's lines to the answer; the cut when the answer filled up before its end. */
async function readOne(request: FileRequest, context: ReadContext): Promise<AnswerCut | null> {
  let shown = request.path;
  try {
    const file = await allowedFile(request.path, context.folders, "working-folder-or-test-logs");
    shown = file.shown;
    const text = await readTextFile(file.real, file.size, maxReadBytes, shown);
    return addFileLines({ real: file.real, shown, text }, request, context);
  } catch (error) {
    if (!(error instanceof ToolRefusal)) throw error;
    return addOrCut(context.answer, `=== ${shown}: ${error.message}`, shown, 1, 1);
  }
}

/** A file that was found allowed and read. */
interface ReadFile {
  readonly real: string;
  readonly shown: string;
  readonly text: TextFile;
}

/** Adds the lines the request asks for and the cache hasn't sent; the cut when the answer filled up. */
function addFileLines(
  { real, shown, text }: ReadFile,
  request: FileRequest,
  { answer, cache, fresh }: ReadContext,
): AnswerCut | null {
  const total = text.lines.length;
  const start = request.start ?? 1;
  if (total === 0 || start > total) {
    return addOrCut(answer, `=== ${shown}: the file has ${total} lines.`, shown, start, start);
  }
  const end = Math.min(total, request.end ?? start + defaultLines - 1);
  if (!answer.add(`=== ${shown} (lines ${lineRange(start, end)} of ${total})`)) {
    return { shown, from: start, to: end };
  }
  const plan = cache.plan(real, text.digest, { start, end }, fresh);
  if (plan.sentBefore.length > 0) answer.add(sentBeforeNote(plan.sentBefore));
  for (const span of plan.send) {
    const sentUpTo = addLines(answer, text.lines, span);
    if (sentUpTo >= span.start)
      cache.markSent(real, text.digest, { start: span.start, end: sentUpTo });
    if (sentUpTo < span.end) return { shown, from: sentUpTo + 1, to: end };
  }
  if (request.end === undefined && end < total) answer.add(moreLinesNote(total, end));
  return null;
}

/** Adds the numbered lines of `span`; the last line number that fit. */
function addLines(answer: AnswerBudget, lines: readonly string[], span: LineSpan): number {
  for (let number = span.start; number <= span.end; number += 1) {
    if (!answer.add(`${number}\t${cutLine(lines[number - 1] ?? "")}`)) return number - 1;
  }
  return span.end;
}

function addOrCut(answer: AnswerBudget, line: string, shown: string, from: number, to: number) {
  return answer.add(line) ? null : { shown, from, to };
}

function sentBeforeNote(spans: readonly LineSpan[]): string {
  const ranges = spans.map((span) => lineRange(span.start, span.end)).join(", ");
  return `(lines ${ranges} unchanged since your earlier read; call again with fresh: true if you no longer have them)`;
}

function moreLinesNote(total: number, end: number): string {
  const next = Math.min(total, end + defaultLines);
  return `… ${total - end} more lines; ask for ${lineRange(end + 1, next)} to read on.`;
}

function notSentNote(cut: AnswerCut, after: readonly FileRequest[]): string {
  const rest = after.length === 0 ? "" : ` and the ${after.length} files after it`;
  return `… [answer full at ${maxAnswerCharacters} characters: '${cut.shown}' lines ${lineRange(cut.from, cut.to)}${rest} weren't sent; ask for them in another call]`;
}

/**
 * The files the call asks for.
 *
 * @throws {ToolRefusal} when `files` isn't a list of 1 to 20 files with a path and whole-number lines
 */
function fileRequests(files: unknown): FileRequest[] {
  if (!Array.isArray(files) || files.length === 0 || files.length > maxFiles) {
    throw new ToolRefusal(`'files' must list 1 to ${maxFiles} files.`);
  }
  return files.map((item: unknown) => {
    if (!isPlainObject(item)) throw new ToolRefusal("Each file must be an object with a path.");
    const fields: ToolArguments = item;
    refuseUnknownArguments(fields, ["path", "start", "end"]);
    const lines = { min: 1, max: Number.MAX_SAFE_INTEGER };
    const request = {
      path: requiredText(fields, "path", 4_096),
      start: optionalInteger(fields, "start", lines),
      end: optionalInteger(fields, "end", lines),
    };
    if (request.end !== undefined && request.end < (request.start ?? 1)) {
      throw new ToolRefusal(`'${request.path}': 'end' comes before 'start'.`);
    }
    return request;
  });
}
