import type { SecretScrubber } from "@halonicjs/std";
import type { CliIo, CommandResult } from "../command.ts";
import { type Phrase, renderPhrase } from "../messages/phrase.ts";
import { errorDocument, type PrintErrorContext, printDebug, printError } from "../print-error.ts";
import { jsonText, resultDocument, scrubbedDocument } from "./json.ts";
import { type Paint, paintFor } from "./paint.ts";
import type { OutputStyle } from "./style.ts";

/**
 * The one writer of a command line's output (cli-output section 2 and 1.8).
 * Results go to stdout and errors to stderr, each painted in its own
 * stream's style. With `--json`, stdout gets one JSON document, for a result
 * or an error alike, and a person's lines go nowhere. Every secret the
 * command loaded is removed from the document.
 */
export interface Printer {
  /** Lines that are the same with and without `--json`, such as the help, to stdout. */
  lines(lines: readonly Phrase[]): void;
  /** What a command did: its lines, or with `--json` its document. */
  result(result: CommandResult): void;
  /** An error, through `printError`: its lines to stderr, or with `--json` its document to stdout. */
  error(error: unknown, context: Omit<PrintErrorContext, "scrubber">): void;
}

export interface PrinterOptions {
  /** Whether `--json` was given. */
  readonly json: boolean;
  /** The style of stdout. */
  readonly out: OutputStyle;
  /** The style of stderr: it may be a terminal while stdout is a pipe. */
  readonly err: OutputStyle;
  /** Knows every secret a command loads, to remove them from what is printed. */
  readonly scrubber: SecretScrubber;
}

/** The {@link Printer} that writes through `io`. */
export function printerFor(io: CliIo, options: PrinterOptions): Printer {
  const out = writerFor(io.out, paintFor(options.out));
  const err = writerFor(io.err, paintFor(options.err));
  return {
    lines: (lines) => printLines(out, lines),
    result(result) {
      if (options.json) {
        const scrub = (text: string) => options.scrubber.scrub(text);
        io.out(jsonText(scrubbedDocument(resultDocument(result), scrub)));
      } else {
        printLines(out, result.lines);
      }
    },
    error(error, errorContext) {
      const context: PrintErrorContext = { ...errorContext, scrubber: options.scrubber };
      if (options.json) {
        io.out(jsonText(errorDocument(error, context)));
        // `--debug` asked for the error's own text: it goes to stderr, and stdout stays one document.
        printDebug(error, err, context);
      } else {
        printError(error, err, context);
      }
    },
  };
}

function writerFor(write: (line: string) => void, paint: Paint): (line: Phrase) => void {
  return (line) => write(renderPhrase(line, paint));
}

function printLines(print: (line: Phrase) => void, lines: readonly Phrase[]): void {
  for (const line of lines) {
    print(line);
  }
}
