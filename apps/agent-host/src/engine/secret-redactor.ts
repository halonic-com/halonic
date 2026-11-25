// The engine role's own standard error, redacted of every secret the shell's
// broker handed it (HAL-18253). Without it, only the shell's key-shape filter
// keeps a broker secret out of `shell.log`, and a secret with no known shape
// (a refresh token, a password) would reach it as printed.
import { redactedForms, redactedValue } from "./step-secrets.ts";

/**
 * Every secret value the engine process got from the shell's broker, and a
 * way to redact them from a text. Unlike {@link StepSecrets}, it keeps each
 * value for as long as the engine runs, so a line written after its step
 * ended (a late error, a rejected promise's stack) is redacted too. That
 * holds the values in memory longer than a step does; the process already
 * held them, so nothing outside it learns more.
 */
export class SecretRedactor {
  readonly #forms = new Set<string>();
  /** The forms, longest first, so a value inside a longer one is not cut short. */
  #ordered: readonly string[] = [];

  /** Redacts `value` from every later text, as written and inside a JSON string. */
  remember(value: string | null): void {
    if (value === null || value === "") return;
    const before = this.#forms.size;
    for (const form of redactedForms(value)) this.#forms.add(form);
    if (this.#forms.size === before) return;
    this.#ordered = [...this.#forms].sort((a, b) => b.length - a.length);
  }

  /** `text` with every remembered value replaced by {@link redactedValue}. */
  redact(text: string): string {
    let redacted = text;
    for (const form of this.#ordered) redacted = redacted.split(form).join(redactedValue);
    return redacted;
  }
}

/** The part of a stream {@link redactStandardError} replaces. */
interface ErrorStream {
  write: NodeJS.WriteStream["write"];
}

/**
 * Sends everything written to `stderr` through `redactor` first, and prints
 * an uncaught error or rejection there, redacted, before the process ends
 * with code 1, as Node would have printed it straight to the file. Call it
 * before standard output is taken over, so a stray print there, which goes
 * to standard error, is redacted too. A value split across two writes is
 * not caught: the engine and Node write whole lines.
 *
 * @param stderr - the process's standard error; tests pass their own
 * @param onUncaught - where uncaught errors are caught; the process by default
 */
export function redactStandardError(
  redactor: SecretRedactor,
  stderr: ErrorStream = process.stderr,
  onUncaught: (handle: (error: unknown) => void) => void = catchUncaught,
): void {
  const write = stderr.write.bind(stderr) as (...args: unknown[]) => boolean;
  stderr.write = ((chunk: unknown, ...rest: unknown[]) =>
    write(redactedChunk(redactor, chunk), ...rest)) as ErrorStream["write"];
  onUncaught((error) => {
    stderr.write(`${uncaughtText(error)}\n`);
  });
}

/** A chunk as text with the values redacted. Node writes a buffer as is, so it is read as UTF-8. */
function redactedChunk(redactor: SecretRedactor, chunk: unknown): unknown {
  if (typeof chunk === "string") return redactor.redact(chunk);
  if (chunk instanceof Uint8Array) return redactor.redact(Buffer.from(chunk).toString("utf8"));
  return chunk;
}

function uncaughtText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  return `Uncaught ${String(error)}`;
}

/** Prints through `handle`, then ends the process with code 1, as Node does for an uncaught error. */
function catchUncaught(handle: (error: unknown) => void): void {
  process.on("uncaughtException", (error) => {
    handle(error);
    process.exit(1);
  });
}
