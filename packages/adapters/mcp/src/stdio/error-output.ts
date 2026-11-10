import { findSecretShape, type SecretScrubber } from "@halonicjs/std";

/** How much of a program's standard error is kept. */
export interface ErrorOutputLimits {
  /** How many of the last lines are kept. */
  readonly maxLines: number;
  /** How many characters of one line are kept; the rest of the line is dropped. */
  readonly maxLineLength: number;
}

const defaultLimits: ErrorOutputLimits = { maxLines: 10, maxLineLength: 300 };

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
  readonly #lines: string[] = [];
  /** The line being written, without its line feed yet. */
  #partial = "";

  constructor(stream: AsyncIterable<Uint8Array>, limits: ErrorOutputLimits = defaultLimits) {
    this.#limits = limits;
    this.#read(stream).catch(() => undefined);
  }

  /** The last lines, oldest first, with a last line that has no line feed yet. */
  lines(): string[] {
    const lines = this.#partial === "" ? [...this.#lines] : [...this.#lines, this.#partial];
    return lines.slice(-this.#limits.maxLines);
  }

  async #read(stream: AsyncIterable<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of stream) this.#add(decoder.decode(chunk, { stream: true }));
    this.#add(decoder.decode());
  }

  #add(text: string): void {
    const [first = "", ...rest] = text.split("\n");
    this.#partial = this.#cut(this.#partial + first);
    for (const part of rest) {
      this.#keep(this.#partial);
      this.#partial = this.#cut(part);
    }
  }

  #keep(line: string): void {
    const trimmed = line.trimEnd();
    if (trimmed === "") return;
    this.#lines.push(trimmed);
    if (this.#lines.length > this.#limits.maxLines) this.#lines.shift();
  }

  #cut(line: string): string {
    return line.slice(0, this.#limits.maxLineLength);
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

/** An e-mail address. Its domain ends in letters, so a package version such as `mail-mcp@2.3.1` is kept. */
const emailAddress = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;

/**
 * Error output with keys and personal data removed, so it can be shown to
 * the person and kept in a log. It removes:
 *
 * - every secret the scrubber knows, in each of its forms, before the
 *   lines are split, so a secret with a line break is still found;
 * - each line holding text shaped like a known kind of key
 *   (`findSecretShape`), as a whole line, since only the kind is known;
 * - e-mail addresses;
 * - the home folder, so paths don't name the person, and their user name.
 *
 * @example
 * const personal = { homeFolder: "/acme/home/acme-user", userName: "acme-user" };
 * cleanErrorOutput(["open /acme/home/acme-user/notes.db: denied"], scrubber, personal);
 * // ["open ~/notes.db: denied"]
 */
export function cleanErrorOutput(
  lines: readonly string[],
  scrubber: SecretScrubber,
  personal: PersonalDetails,
): string[] {
  return scrubber
    .scrub(lines.join("\n"))
    .split("\n")
    .map((line) => (findSecretShape(line) === undefined ? line : keyLineRemoved))
    .map((line) => line.replace(emailAddress, "[e-mail removed]"))
    .map((line) => withoutHome(line, personal));
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
