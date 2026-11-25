// The engine role's secrets and key origins for one step (B1, HAL-17050).
// They come only from Studio's shell, through the control pipe's broker
// requests: never from the environment, the command line or the secrets file.
// Read only: the pipe has no request that sets, removes or adds anything.
import { type KeyOrigins, maxAllowedOrigins, type Secrets, secretKey } from "@halonicjs/ports";
import type { BrokerAnswer, RefusalReason } from "./control-messages.ts";
import type { BrokerRequestKind } from "./control-pipe.ts";

/** Asks the shell's broker, as `ControlPipe.ask` does. */
export type AskBroker = (kind: BrokerRequestKind, name: string) => Promise<BrokerAnswer>;

/** What stands in a text for a secret's value. */
export const redactedValue = "[redacted]";

/** Why a step can't have a secret it asked for. Its message never holds a value. */
export class StepSecretsError extends Error {
  override name = "StepSecretsError";
  /** `untrusted` refuses the run; the rest fail the step. */
  readonly reason: "untrusted" | "unavailable" | "failed";

  constructor(reason: StepSecretsError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * The secrets and key origins one step reads, through the shell's broker.
 * Each value it gets is kept in memory only until {@link close}, which the
 * engine calls when the step ends, and is redacted from any text passed to
 * {@link redact} until then. A name the broker refuses as invalid or
 * reserved counts as not found.
 */
export class StepSecrets implements Secrets, KeyOrigins {
  readonly store = "keychain";
  readonly #ask: AskBroker;
  readonly #values = new Map<string, string | null>();
  #closed = false;

  constructor(ask: AskBroker) {
    this.#ask = ask;
  }

  /**
   * The secret's value, or `null` when the shell has none under the name.
   *
   * @throws RangeError when the name breaks the secret name rule, before anything is asked
   * @throws {StepSecretsError} when the broker refuses for any other reason, or the step ended
   */
  async get(name: string): Promise<string | null> {
    const key = secretKey(name);
    this.#checkOpen();
    if (this.#values.has(key)) return this.#values.get(key) ?? null;
    const answer = await this.#ask("secret_get", name);
    // The step may have ended while the shell answered: keep nothing then.
    this.#checkOpen();
    if (answer.result === "refused") return notFoundOrThrow(answer.reason);
    if (answer.result !== "value") throw failure("The shell's broker answered with origins.");
    this.#values.set(key, answer.value);
    return answer.value;
  }

  /**
   * The origins the key may go to, or `undefined` when the shell has none recorded.
   *
   * @throws RangeError when the name breaks the secret name rule, before anything is asked
   * @throws {StepSecretsError} when the broker refuses, the list is empty or too long, or the step ended
   */
  async allowedOrigins(name: string): Promise<readonly string[] | undefined> {
    secretKey(name);
    this.#checkOpen();
    const answer = await this.#ask("origins_get", name);
    this.#checkOpen();
    if (answer.result === "refused") return notFoundOrThrow(answer.reason) ?? undefined;
    if (answer.result !== "origins") throw failure("The shell's broker answered with a value.");
    if (answer.origins === null) return undefined;
    // An empty list would read as "none recorded" to some callers, which is laxer, not stricter.
    if (answer.origins.length === 0 || answer.origins.length > maxAllowedOrigins) {
      throw failure(`A key's origins list holds 1 to ${maxAllowedOrigins} origins.`);
    }
    return [...answer.origins];
  }

  /**
   * `text` with every value this step got replaced by {@link redactedValue},
   * as written and as it appears inside a JSON string (escaped once or twice),
   * longest first. A value of 1 to 3 characters is redacted too: a short
   * secret is still a secret, and redacting too much is the safer mistake.
   */
  redact(text: string): string {
    const forms = new Set<string>();
    for (const value of this.#values.values()) {
      if (value === null || value === "") continue;
      for (const form of redactedForms(value)) forms.add(form);
    }
    let redacted = text;
    for (const form of [...forms].sort((a, b) => b.length - a.length)) {
      redacted = redacted.split(form).join(redactedValue);
    }
    return redacted;
  }

  /** Ends the step: forgets every value, and refuses every later read. */
  close(): void {
    this.#closed = true;
    this.#values.clear();
  }

  #checkOpen(): void {
    if (this.#closed) throw failure("The step's secrets were read after the step ended.");
  }
}

/**
 * The value, its form inside a JSON string, and that form inside another JSON
 * string (a tool's JSON arguments logged as a JSON string), so a value holding
 * a quote, a backslash or a newline is redacted wherever a step writes it.
 */
export function redactedForms(value: string): readonly string[] {
  const escapedOnce = escapeForJsonString(value);
  return [value, escapedOnce, escapeForJsonString(escapedOnce)];
}

function escapeForJsonString(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

/** `null` for a name the broker won't look up; otherwise the refusal as an error. */
function notFoundOrThrow(reason: RefusalReason): null {
  switch (reason) {
    case "invalid_name":
    case "reserved_name":
      return null;
    case "untrusted":
      throw new StepSecretsError("untrusted", "The workspace isn't trusted on this computer.");
    case "busy":
    case "unavailable":
    case "denied":
      throw new StepSecretsError("unavailable", `Secrets unavailable: the keychain is ${reason}.`);
    case "unreadable":
    case "failed":
      throw failure(`The keychain read failed: ${reason}.`);
  }
}

function failure(message: string): StepSecretsError {
  return new StepSecretsError("failed", message);
}
