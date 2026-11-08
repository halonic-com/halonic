/** What a secret shows wherever it's turned into text by accident. */
const hidden = "[secret]";

/**
 * A value typed into a secret field, such as a client secret or an API key. It isn't a string, so
 * it can't go where text goes: `CopyButton` takes only a `string`, so the types refuse a secret,
 * and it checks again at run time. Turned into text by accident (a template string, a log line,
 * `JSON.stringify`), it shows `[secret]`, never the value.
 *
 * Only the request that saves the value to the secret store calls {@link SecretText.reveal}.
 *
 * @example
 * const secret = new SecretText(input.value);
 * await saveSecret(account, secret.reveal());
 */
export class SecretText {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The value itself. Call it only in the request that saves it to the secret store. */
  reveal(): string {
    return this.#value;
  }

  /** Whether nothing was typed, without revealing the value. */
  get isEmpty(): boolean {
    return this.#value === "";
  }

  toString(): string {
    return hidden;
  }

  toJSON(): string {
    return hidden;
  }
}
