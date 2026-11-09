import { errorKindOf, type SecretScrubber } from "@halonicjs/std";
import { UsageError } from "./command.ts";
import type { Message } from "./messages/define.ts";
import { errorMessages } from "./messages/general.ts";
import { markPart, type Phrase, phrase } from "./messages/phrase.ts";

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
  const scrub: Scrub = (text) => context.scrubber?.scrub(text) ?? text;
  for (const line of errorLines(error, context, scrub)) {
    print(line);
  }
  if (context.debug === true) {
    for (const line of debugLines(error, scrub)) {
      print(line);
    }
  }
}

/** The ✕ line, then the fix line and the docs line when the error has them. */
function errorLines(error: unknown, context: PrintErrorContext, scrub: Scrub): Phrase[] {
  if (error instanceof UsageError) {
    const fix = error.fixMessage ?? context.usage;
    const problem = scrubPhrase(error.problem.phrase, scrub);
    return [
      failedLine(problem),
      ...fixLines(fix === undefined ? undefined : scrubPhrase(fix.phrase, scrub)),
    ];
  }
  if (errorKindOf(error) === "internal") {
    const reason = errorMessages.internal().phrase;
    return [
      failedLine(withAction(reason, context)),
      ...fixLines(errorMessages.internalFix().phrase),
    ];
  }
  const field = (name: TextField) => {
    const text = textField(error, name);
    return text === undefined ? undefined : scrub(text);
  };
  const reason = phrase`${field("message") ?? ""}`;
  const fix = field("fix");
  const docs = field("docs");
  const code = field("code");
  const lines = [
    failedLine(withAction(reason, context)),
    ...fixLines(fix === undefined ? undefined : phrase`${fix}`),
  ];
  if (docs !== undefined) {
    lines.push(phrase`  ${errorMessages.more(docs, code).phrase}`);
  }
  return lines;
}

/** The phrase with the loaded secrets replaced in each of its texts. */
function scrubPhrase(value: Phrase, scrub: Scrub): Phrase {
  return value.map((part) => {
    if (typeof part === "string") {
      return scrub(part);
    }
    return "text" in part ? { ...part, text: scrub(part.text) } : part;
  });
}

function failedLine(text: Phrase): Phrase {
  return phrase`${markPart("failed")} ${text}`;
}

function fixLines(fix: Phrase | undefined): Phrase[] {
  return fix === undefined ? [] : [phrase`  ${fix}`];
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
