import { type ErrorKind, errorKindOf, type SecretScrubber } from "@halonicjs/std";
import { OwnLineError, UsageError } from "./command.ts";
import type { Message } from "./messages/define.ts";
import { errorMessages } from "./messages/general.ts";
import { markPart, type Phrase, phrase, plainText } from "./messages/phrase.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { outputVersion } from "./output/json.ts";
import type { TrustChangesDocument } from "./output/trust-changes-json.ts";

/** How deep `--debug` follows `cause`, so a cause that points back at itself still ends. */
const maxCauses = 10;

/** Replaces the secrets the CLI loaded in a whole text. */
type Scrub = (text: string) => string;

/** What {@link printError} knows besides the error itself. */
export interface PrintErrorContext {
  /** The command's usage line, the fix of a {@link UsageError} that has none of its own. */
  readonly usage?: Message;
  /** What the command was doing, such as "write the schemas", for "Couldn't …:" on line 1. */
  readonly action?: Message;
  /** `--debug` was given: print the error's own text, causes and stack after its lines. */
  readonly debug?: boolean;
  /**
   * Replaces the secrets the CLI loaded in every line printed. Optional for
   * tests; `runCli` always passes the one its `Secrets` feed.
   */
  readonly scrubber?: SecretScrubber;
}

/**
 * Writes an error in the one shape the CLI uses for errors (F16, cli-output
 * 1.3): line 1 is ✕ and "Couldn't *action*: *reason*." (or the reason alone
 * when the command names no action), line 2 the one fix, indented, and an
 * optional line 3 with `More:`, the docs link and the code. This is the only
 * code that writes that shape; commands throw errors and never print them.
 *
 * The fix comes from the error's own `fix` (or the usage line for a wrong
 * command line). An error without one gets no fix line: nothing here makes
 * one up. An error without a kind is a bug, so its text is never shown,
 * unless `--debug` asks for it.
 *
 * With `--debug`, every error, of any kind, is followed by its own message,
 * its `cause` chain and its stack, for a bug report.
 *
 * Every text is scrubbed of the secrets the CLI loaded, as a whole and
 * before it is split into lines, so a secret that holds a line break, such
 * as a PEM key, is still found (cli-output 1.3, rule 5).
 *
 * @param error - anything a command threw
 * @param print - writes one line, to stderr
 */
export function printError(
  error: unknown,
  print: (line: Phrase) => void,
  context: PrintErrorContext = {},
): void {
  for (const line of errorLines(reportOf(error, context))) {
    print(line);
  }
  printDebug(error, print, context);
}

/** The `--json` document of a failed command (cli-output 1.8). */
export interface ErrorDocument {
  readonly outputVersion: typeof outputVersion;
  readonly ok: false;
  readonly error: {
    /** The error's kind, `usage` for a wrong command line, or `not_trusted` for an untrusted workspace. */
    readonly kind: ReportKind;
    /** The error's detailed code, left out when it has none. */
    readonly code?: string;
    /** The reason, the same sentence as line 1 without "Couldn't …:". */
    readonly message: string;
    /** The one fix, the same sentence as line 2, left out when there is none. */
    readonly fix?: string;
    /** For `not_trusted` only: the full fingerprint `trust --fingerprint` takes, never shortened. */
    readonly fingerprint?: string;
    /** For `not_trusted` only: what changed since the workspace was trusted, left out when it never was. */
    readonly changes?: TrustChangesDocument;
  };
}

/**
 * The error as `--json` gives it (cli-output 1.8): the same report as
 * {@link printError}'s lines, so a script reads the same words, scrubbed the
 * same way. A bug's own text stays out here too.
 */
export function errorDocument(error: unknown, context: PrintErrorContext = {}): ErrorDocument {
  const report = reportOf(error, context);
  return {
    outputVersion,
    ok: false,
    error: {
      kind: report.kind,
      ...(report.code === undefined ? {} : { code: report.code }),
      message: plainText(report.reason),
      ...(report.fix === undefined ? {} : { fix: plainText(report.fix) }),
      ...(error instanceof NotTrustedError ? notTrustedFields(error) : {}),
    },
  };
}

/** The fingerprint `trust --fingerprint` takes and, when the workspace was trusted before, what changed. */
function notTrustedFields(error: NotTrustedError) {
  return {
    fingerprint: error.fingerprint,
    ...(error.changes === undefined ? {} : { changes: error.changes }),
  };
}

/** With `--debug`, the error's own text, causes and stack; nothing without it. */
export function printDebug(
  error: unknown,
  print: (line: Phrase) => void,
  context: PrintErrorContext = {},
): void {
  if (context.debug !== true) {
    return;
  }
  for (const line of debugLines(error, scrubFor(context))) {
    print(line);
  }
}

/** The kinds an error report can have: `std`'s, and the CLI's own two. */
type ReportKind = ErrorKind | "usage" | "not_trusted";

/** What an error says, scrubbed, before it is shaped as lines or as JSON. */
interface ErrorReport {
  readonly kind: ReportKind;
  /** The reason on its own, without the command's action. */
  readonly reason: Phrase;
  /** Line 1: the reason after "Couldn't *action*:", or alone for a wrong command line. */
  readonly firstLine: Phrase;
  readonly fix: Phrase | undefined;
  readonly docs: string | undefined;
  readonly code: string | undefined;
}

function reportOf(error: unknown, context: PrintErrorContext): ErrorReport {
  const scrub = scrubFor(context);
  if (error instanceof UsageError) {
    const fix = error.fixMessage ?? context.usage;
    const problem = scrubPhrase(error.problem.phrase, scrub);
    return {
      kind: "usage",
      reason: problem,
      firstLine: problem,
      fix: fix === undefined ? undefined : scrubPhrase(fix.phrase, scrub),
      docs: undefined,
      code: undefined,
    };
  }
  if (error instanceof NotTrustedError) {
    const reason = scrubPhrase(error.problem.phrase, scrub);
    const action = error.action === undefined ? context.action : (error.action ?? undefined);
    return {
      kind: error.kind,
      reason,
      firstLine: withAction(reason, action === undefined ? {} : { action }),
      fix: scrubPhrase(error.fixMessage.phrase, scrub),
      docs: undefined,
      code: error.code,
    };
  }
  const kind = errorKindOf(error);
  if (kind === "internal") {
    const reason = errorMessages.internal().phrase;
    return {
      kind,
      reason,
      firstLine: withAction(reason, context),
      fix: errorMessages.internalFix().phrase,
      docs: undefined,
      code: undefined,
    };
  }
  const field = (name: TextField) => {
    const text = textField(error, name);
    return text === undefined ? undefined : scrub(text);
  };
  const reason = phrase`${field("message") ?? ""}`;
  const fix = field("fix");
  return {
    kind,
    reason,
    firstLine: error instanceof OwnLineError ? reason : withAction(reason, context),
    fix: fix === undefined ? undefined : phrase`${fix}`,
    docs: field("docs"),
    code: field("code"),
  };
}

/** The ✕ line, then the fix line and the docs line when the error has them. */
function errorLines(report: ErrorReport): Phrase[] {
  const lines = [phrase`${markPart("failed")} ${report.firstLine}`];
  if (report.fix !== undefined) {
    lines.push(phrase`  ${report.fix}`);
  }
  if (report.docs !== undefined) {
    lines.push(phrase`  ${errorMessages.more(report.docs, report.code).phrase}`);
  }
  return lines;
}

function scrubFor(context: PrintErrorContext): Scrub {
  return (text) => context.scrubber?.scrub(text) ?? text;
}

/** The phrase with the loaded secrets replaced in each of its texts. */
export function scrubPhrase(value: Phrase, scrub: Scrub): Phrase {
  return value.map((part) => {
    if (typeof part === "string") {
      return scrub(part);
    }
    return "text" in part ? { ...part, text: scrub(part.text) } : part;
  });
}

/** "Couldn't *action*: *reason*" when the command named its action, else the reason alone. */
function withAction(reason: Phrase, context: PrintErrorContext): Phrase {
  if (context.action === undefined) {
    return reason;
  }
  return errorMessages.couldnt(context.action.phrase, asReason(reason)).phrase;
}

/**
 * Words that start a reason written as its own sentence, such as "There's no
 * workflow called …". After "Couldn't …:" they go lower case; any other first
 * word is kept, because it's usually a name: "Halonic couldn't reach Ollama".
 */
const sentenceOpeners = new Set([
  "There's",
  "There",
  "The",
  "This",
  "That",
  "It",
  "It's",
  "Its",
  "A",
  "An",
  "No",
  "Nothing",
]);

function asReason(reason: Phrase): Phrase {
  const [first, ...rest] = reason;
  if (typeof first !== "string") {
    return reason;
  }
  const firstWord = first.split(" ")[0] ?? "";
  if (!sentenceOpeners.has(firstWord)) {
    return reason;
  }
  return [first.charAt(0).toLowerCase() + first.slice(1), ...rest];
}

/**
 * The error's own text for `--debug`: its stack (or its message when it has
 * none), then each error in its `cause` chain, starting with "Caused by:".
 */
function debugLines(error: unknown, scrub: Scrub): Phrase[] {
  return causeChain(error).flatMap((value, index) => {
    const [first = "", ...rest] = scrub(ownText(value)).split(/\r?\n/);
    const firstLine = index === 0 ? phrase`${first}` : errorMessages.causedBy(first).phrase;
    return [firstLine, ...rest.map((line) => phrase`${line}`)];
  });
}

/** The error, then the error it wraps, and so on: at most {@link maxCauses} causes, each once. */
function causeChain(error: unknown): unknown[] {
  const chain = [error];
  let cause = causeOf(error);
  while (cause !== undefined && !chain.includes(cause) && chain.length <= maxCauses) {
    chain.push(cause);
    cause = causeOf(cause);
  }
  return chain;
}

/** A thrown value's stack, which starts with its name and message, or else its message. */
function ownText(value: unknown): string {
  if (typeof value === "object" && value !== null && "stack" in value) {
    const stack = value.stack;
    if (typeof stack === "string" && stack !== "") {
      return stack;
    }
  }
  return messageOf(value);
}

/** The error a thrown value wraps, if any. */
function causeOf(value: unknown): unknown {
  return typeof value === "object" && value !== null && "cause" in value ? value.cause : undefined;
}

/** A thrown value's message, or the value itself as text when it has none. */
function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

/** The text fields an error with a kind may carry. */
type TextField = "message" | "fix" | "docs" | "code";

/** A text field of an error with a kind, when it's there and isn't only spaces. */
function textField(error: unknown, field: TextField): string | undefined {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return undefined;
  }
  const value: unknown = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
