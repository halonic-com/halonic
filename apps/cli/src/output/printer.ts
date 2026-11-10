import type { SecretScrubber } from "@halonicjs/std";
import type { CliIo, CommandResult } from "../command.ts";
import { type Phrase, phrase, renderPhrase } from "../messages/phrase.ts";
import { NotTrustedError } from "../not-trusted.ts";
import {
  errorDocument,
  type PrintErrorContext,
  printDebug,
  printError,
  scrubPhrase,
} from "../print-error.ts";
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
  /**
   * An error, through `printError`: its lines to stderr, or with `--json` its
   * document to stdout. A {@link NotTrustedError} also shows its trust check
   * on stderr before the ✕ line and ends stdout with the bare fingerprint.
   */
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
        return;
      }
      if (error instanceof NotTrustedError) {
        printNotTrusted(error, { out, err: scrubbed(err, options.scrubber) }, context);
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

/**
 * The untrusted workspace's three parts, in order (`cli.not-trusted`): the
 * trust check on stderr, the ✕ and fix lines on stderr, then the bare
 * fingerprint as the last stdout line, so `tail -n1` gives exactly what
 * `--fingerprint` takes.
 */
function printNotTrusted(
  error: NotTrustedError,
  streams: { out: (line: Phrase) => void; err: (line: Phrase) => void },
  context: PrintErrorContext,
): void {
  printLines(streams.err, error.check);
  printError(error, streams.err, context);
  streams.out(phrase`${error.fingerprint}`);
}

/**
 * The writer with every loaded secret removed from each line. The trust
 * check shows `env` values as written, which may hold a secret the command
 * loaded; `printError` scrubs its own lines.
 */
function scrubbed(print: (line: Phrase) => void, scrubber: SecretScrubber): (line: Phrase) => void {
  return (line) => print(scrubPhrase(line, (text) => scrubber.scrub(text)));
}
