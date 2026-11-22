import { findSecretShape, type SecretScrubber } from "@halonicjs/std";

/** How much of a program's standard error is kept. */
export interface ErrorOutputLimits {
  /** How many of the last lines are kept. */
  readonly maxLines: number;
  /** How many characters of one line are kept; the rest of the line is dropped. */
  readonly maxLineLength: number;
}

const defaultLimits: ErrorOutputLimits = { maxLines: 10, maxLineLength: 300 };

/** One line {@link ErrorOutputTail} kept, as the program wrote it. */
export interface ErrorOutputLine {
  readonly text: string;
  /**
   * Whether the line was longer than `maxLineLength`, so only its start was
   * kept. A secret can start in that start and end in the part that was
   * dropped, and a part of a secret isn't found, so {@link cleanErrorOutput}
   * removes such a line whole.
   */
  readonly cut: boolean;
  /**
   * Whether text right before this line wasn't kept: older lines were
   * dropped, or the line before was cut. A secret with a line break, such
   * as a PEM key, can start in that lost text and end in this line, and the
   * end of a secret isn't found either, so {@link cleanErrorOutput} removes
   * this line whole too.
   */
  readonly afterLostText: boolean;
}

/**
 * The last few lines a program wrote to its standard error, kept in memory
 * only, so a connector can say why its program stopped. The whole stream
 * is read, so the program never blocks on a full pipe, but only the last
 * `maxLines` lines are kept, each cut at `maxLineLength` characters, so a
 * program can't fill memory. Never log these lines as they are: they can
 * hold anything, so read them through {@link cleanErrorOutput}.
 */
export class ErrorOutputTail {
  readonly #limits: ErrorOutputLimits;
  readonly #lines: ErrorOutputLine[] = [];
  /** Settles once the whole stream is read. */
  readonly #read: Promise<void>;
  /** The line being written, without its line feed yet. */
  #partial = "";
  #partialCut = false;
  /** Whether the tail has dropped any of its older lines. */
  #droppedOlder = false;
  /** Whether the last line kept was cut, so the next one follows lost text. */
  #lastKeptCut = false;

  constructor(stream: AsyncIterable<Uint8Array>, limits: ErrorOutputLimits = defaultLimits) {
    this.#limits = limits;
    this.#read = this.#readAll(stream).catch(() => undefined);
  }

  /** The last lines, oldest first, with a last line that has no line feed yet. */
  lines(): ErrorOutputLine[] {
    const partial = {
      text: this.#partial,
      cut: this.#partialCut,
      afterLostText: this.#lastKeptCut,
    };
    const lines = this.#partial === "" ? [...this.#lines] : [...this.#lines, partial];
    const kept = lines.slice(-this.#limits.maxLines);
    const [first, ...rest] = kept;
    const droppedOlder = this.#droppedOlder || kept.length < lines.length;
    if (first === undefined || !droppedOlder) return kept;
    return [{ ...first, afterLostText: true }, ...rest];
  }

  /**
   * The last lines once the program has closed the stream, or after
   * `maxWaitMs` when it hasn't: a program it started can keep the stream
   * open after it ended itself. A program can write its last lines just
   * before it ends, so read them here rather than with {@link lines} once
   * it has ended.
   */
  async linesOnceRead(maxWaitMs: number): Promise<ErrorOutputLine[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, maxWaitMs);
    });
    try {
      await Promise.race([this.#read, waited]);
    } finally {
      clearTimeout(timer);
    }
    return this.lines();
  }

  async #readAll(stream: AsyncIterable<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of stream) this.#add(decoder.decode(chunk, { stream: true }));
    this.#add(decoder.decode());
  }

  #add(text: string): void {
    const [first = "", ...rest] = text.split("\n");
    this.#extendPartial(first);
    for (const part of rest) {
      this.#keepPartial();
      this.#extendPartial(part);
    }
  }

  /** Adds text to the line being written, keeping only its first `maxLineLength` characters. */
  #extendPartial(text: string): void {
    const line = this.#partial + text;
    // Spaces at the end are dropped anyway, so they alone don't make a line cut.
    if (line.trimEnd().length > this.#limits.maxLineLength) this.#partialCut = true;
    this.#partial = line.slice(0, this.#limits.maxLineLength);
  }

  #keepPartial(): void {
    const text = this.#partial.trimEnd();
    const cut = this.#partialCut;
    this.#partial = "";
    this.#partialCut = false;
    // A blank line holds nothing of a secret, so a line after a cut one still follows lost text.
    if (text === "") return;
    this.#lines.push({ text, cut, afterLostText: this.#lastKeptCut });
    this.#lastKeptCut = cut;
    if (this.#lines.length > this.#limits.maxLines) {
      this.#lines.shift();
      this.#droppedOlder = true;
    }
  }
}

/** What {@link cleanErrorOutput} removes besides the secrets the scrubber knows. */
export interface PersonalDetails {
  /** The person's home folder, written as `~`. */
  readonly homeFolder: string | undefined;
  /** The person's user name on this computer, as a whole word, written as `[user]`. */
  readonly userName: string | undefined;
}

/** What replaces a whole line that holds text shaped like a key. */
export const keyLineRemoved = "[line removed: it held something shaped like a key]";

/** What replaces a whole line that was too long to keep, so it can't be checked for a secret. */
export const longLineRemoved = "[line removed: too long to check]";

/**
 * What replaces a whole line that follows text the tail didn't keep, since it
 * can hold the end of a secret whose start was lost.
 */
export const afterLostLineRemoved = "[line removed: it follows text that wasn't kept]";

/** An e-mail address. Its domain ends in letters, so a package version such as `mail-mcp@2.3.1` is kept. */
const emailAddress = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;

/**
 * Error output with keys and personal data removed, so it can be shown to
 * the person and kept in a log. It removes:
 *
 * - each line the tail cut, as a whole line: only the start of a secret
 *   may be left in it, and the scrubber finds whole secrets only;
 * - each line that follows text the tail didn't keep (older lines it
 *   dropped, or a line it cut), as a whole line: only the end of a secret
 *   with a line break may be left in it;
 * - every secret the scrubber knows, in each of its forms, before the
 *   lines are split, so a secret with a line break is still found;
 * - each line holding text shaped like a known kind of key
 *   (`findSecretShape`), as a whole line, since only the kind is known;
 * - e-mail addresses;
 * - the home folder, so paths don't name the person, and their user name.
 *
 * Clean the lines before cutting them any shorter, never after: a shorter
 * cut can leave only the start of a secret, which nothing here finds.
 *
 * @example
 * const personal = { homeFolder: "/acme/home/acme-user", userName: "acme-user" };
 * const lines = [
 *   { text: "open /acme/home/acme-user/notes.db: denied", cut: false, afterLostText: false },
 * ];
 * cleanErrorOutput(lines, scrubber, personal);
 * // ["open ~/notes.db: denied"]
 */
export function cleanErrorOutput(
  lines: readonly ErrorOutputLine[],
  scrubber: SecretScrubber,
  personal: PersonalDetails,
): string[] {
  const whole = lines.map(wholeLineOrRemoved);
  return scrubber
    .scrub(whole.join("\n"))
    .split("\n")
    .map((line) => (findSecretShape(line) === undefined ? line : keyLineRemoved))
    .map((line) => line.replace(emailAddress, "[e-mail removed]"))
    .map((line) => withoutHome(line, personal));
}

/** The line's text, or what replaces it when only a part of a secret could be left in it. */
function wholeLineOrRemoved(line: ErrorOutputLine): string {
  if (line.cut) return longLineRemoved;
  if (line.afterLostText) return afterLostLineRemoved;
  return line.text;
}

function withoutHome(line: string, { homeFolder, userName }: PersonalDetails): string {
  let cleaned = line;
  if (homeFolder !== undefined && homeFolder.length > 1) {
    cleaned = cleaned.replaceAll(homeFolder, "~");
  }
  if (userName !== undefined && userName !== "") {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegExp(userName)}\\b`, "gi"), "[user]");
  }
  return cleaned;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
