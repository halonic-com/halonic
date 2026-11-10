import type { SecretScrubber } from "@halonicjs/std";
import type { CliIo, CommandResult, StoppedResult } from "../command.ts";
import { type Phrase, phrase, renderPhrase } from "../messages/phrase.ts";
import { stopMessages } from "../messages/stop.ts";
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
import { printedAhead } from "./printed-ahead.ts";
import { type Clock, type Progress, startProgress } from "./progress.ts";
import { type Asking, askYesNo, type Question } from "./question.ts";
import type { SharedLine } from "./shared-line.ts";
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
  /**
   * A result line that is final, to stdout now, above the live line; with
   * `--json`, nothing. Noted, so {@link Printer.result} doesn't print it again.
   */
  ahead(line: Phrase): void;
  /**
   * What a command did: its lines after those printed ahead, or with `--json`
   * its document. When the lines printed ahead don't start the result, a bug,
   * every line is printed.
   */
  result(result: CommandResult): void;
  /**
   * An error, through `printError`: its lines to stderr, or with `--json` its
   * document to stdout. A {@link NotTrustedError} also shows its trust check
   * on stderr before the ✕ line and ends stdout with the bare fingerprint.
   */
  error(error: unknown, context: Omit<PrintErrorContext, "scrubber">): void;
  /**
   * Starts the live ◌ line of a step on stderr (cli-output 1.5). Without a
   * live line, such as through a pipe or with `--json`, it draws nothing.
   *
   * @param doing - what the step is doing, such as "Draft a reply"
   */
  progress(doing: Phrase): Progress;
  /**
   * With `--debug`, a command's line for engineers to stderr, scrubbed and
   * above the live line; also with `--json`, as an error's `--debug` text
   * is, since stdout stays one document. Without `--debug`, nothing.
   */
  debug(line: Phrase): void;
  /**
   * A command that Ctrl C or SIGTERM stopped (cli-output 1.5): the live line
   * goes away, then "Stopped." and what that meant go to stderr, since
   * they aren't a result. With `--json`, stdout gets the command's document
   * with `"ok": false` instead, and stderr stays empty. A second signal
   * prints this with no result: only "Stopped.", or `{ "outputVersion": 1,
   * "ok": false }`.
   */
  stopped(result?: StoppedResult): void;
  /** Takes the live line away for good, when the command has ended. */
  close(): void;
  /**
   * Asks a yes-or-no question on stderr, in its style, after the lines the
   * question shows first, and returns whether the answer was yes (see
   * `askYesNo`). A live line is taken away first, so the question and the
   * answer typed after it have the line to themselves. It may be asked again
   * for a second question. Once `signal` is aborted, a question waiting for
   * its answer ends and throws (see `askYesNo`).
   */
  ask(question: Question, signal?: AbortSignal): Promise<boolean>;
}

export interface PrinterOptions {
  /** Whether `--json` was given. */
  readonly json: boolean;
  /** Whether `--debug` was given: only then do a command's debug lines show. */
  readonly debug: boolean;
  /** The style of stdout. */
  readonly out: OutputStyle;
  /** The style of stderr: it may be a terminal while stdout is a pipe. */
  readonly err: OutputStyle;
  /** Knows every secret a command loads, to remove them from what is printed. */
  readonly scrubber: SecretScrubber;
  /**
   * The live line on stderr, when stderr is a terminal with live lines.
   * Every line either stream writes goes around it, since both share the
   * screen.
   */
  readonly liveLine?: SharedLine;
  /** The clock the live line counts on; the computer's own when left out. */
  readonly clock?: Clock;
  /** Where questions are asked and whether they may be; without it, every question refuses. */
  readonly questions?: Omit<Asking, "render">;
}

/** Where questions go when there's nowhere to ask them: nothing is written or read. */
const nowhereToAsk: Omit<Asking, "render"> = {
  canAsk: false,
  terminal: { write: () => undefined, readLine: async () => undefined },
};

/** The {@link Printer} that writes through `io`. */
export function printerFor(io: CliIo, options: PrinterOptions): Printer {
  const { liveLine } = options;
  const aroundLine =
    (write: (line: string) => void) =>
    (line: string): void => {
      if (liveLine === undefined) {
        write(line);
      } else {
        liveLine.around(() => write(line));
      }
    };
  const writeOut = aroundLine(io.out);
  const writeErr = aroundLine(io.err);
  const out = writerFor(writeOut, paintFor(options.out));
  const errPaint = paintFor(options.err);
  const err = writerFor(writeErr, errPaint);
  const asking: Asking = {
    ...(options.questions ?? nowhereToAsk),
    render: (line) => renderPhrase(line, errPaint),
  };
  const ahead = printedAhead();
  const writeDocument = (result: CommandResult | StoppedResult) => {
    const scrub = (text: string) => options.scrubber.scrub(text);
    writeOut(jsonText(scrubbedDocument(resultDocument(result), scrub)));
  };
  return {
    lines: (lines) => printLines(out, lines),
    ahead(line) {
      ahead.note(line);
      if (!options.json) {
        out(line);
      }
    },
    result(result) {
      // Also with `--json`, so a command's mismatch shows in its tests either way.
      const rest = ahead.rest(result.lines);
      if (options.json) {
        writeDocument(result);
      } else {
        printLines(out, rest);
      }
    },
    stopped(result = notSaid) {
      // The line says the command was interrupted, so it comes after the live line is gone.
      liveLine?.close();
      if (options.json) {
        writeDocument(result);
      } else {
        err(stopMessages.stopped(result.meaning).phrase);
      }
    },
    error(error, errorContext) {
      const context: PrintErrorContext = { ...errorContext, scrubber: options.scrubber };
      if (options.json) {
        writeOut(jsonText(errorDocument(error, context)));
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
    progress(doing) {
      if (liveLine === undefined) {
        return startProgress(doing, { live: false, line: noLine });
      }
      return startProgress(doing, {
        live: true,
        line: liveLine,
        ...(options.clock === undefined ? {} : { clock: options.clock }),
      });
    },
    debug(line) {
      if (options.debug) {
        scrubbed(err, options.scrubber)(line);
      }
    },
    close: () => liveLine?.close(),
    ask(question, signal) {
      liveLine?.clear();
      return askYesNo(question, asking, signal);
    },
  };
}

/** A stop the command had no say in, such as a second signal: only "Stopped.". */
const notSaid: StoppedResult = { stopped: true, json: {} };

/** What a printer without a live line hands `startProgress`, which then draws nothing. */
const noLine = { draw: () => {}, clear: () => {} };

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
