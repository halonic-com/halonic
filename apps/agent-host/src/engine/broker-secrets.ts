// The engine's secrets and key origins, as `openLocalEngine` takes them:
// each read goes to Studio's shell through the control pipe (HAL-17050).
// The engine has no hook for a step's end yet, so each read is its own
// short step: the value is handed to the caller and kept nowhere here,
// except in the engine's redactor for its standard error (HAL-18253).
import type { KeyOrigins, Secrets } from "@halonicjs/ports";
import type { SecretRedactor } from "./secret-redactor.ts";
import { type AskBroker, StepSecrets } from "./step-secrets.ts";

/**
 * Reads through a new {@link StepSecrets} for every call and closes it
 * straight after, so this object never holds a value. Each value it hands
 * out goes to `redactor` first, which redacts it from the engine's standard
 * error for as long as the engine runs. Refusals and name checks are
 * {@link StepSecrets}'s.
 */
export class BrokerSecrets implements Secrets, KeyOrigins {
  readonly store = "keychain";
  readonly #ask: AskBroker;
  readonly #redactor: SecretRedactor;

  constructor(ask: AskBroker, redactor: SecretRedactor) {
    this.#ask = ask;
    this.#redactor = redactor;
  }

  /** The secret's value, or `null` when the shell has none under the name. */
  async get(name: string): Promise<string | null> {
    const value = await this.#once((step) => step.get(name));
    this.#redactor.remember(value);
    return value;
  }

  /** The origins the key may go to, or `undefined` when the shell has none recorded. */
  async allowedOrigins(name: string): Promise<readonly string[] | undefined> {
    return await this.#once((step) => step.allowedOrigins(name));
  }

  async #once<T>(read: (step: StepSecrets) => Promise<T>): Promise<T> {
    const step = new StepSecrets(this.#ask);
    try {
      return await read(step);
    } finally {
      step.close();
    }
  }
}
