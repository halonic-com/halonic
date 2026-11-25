import { asRecord, field, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";

/** The Paperclip user a key belongs to, as far as the apps show it. */
export interface PaperclipUser {
  /** Their name in Paperclip, such as "Board Supervisor". */
  name?: string;
}

/**
 * Whom a connection's key belongs to (`GET /api/cli-auth/me`). The hosts make
 * the provider with no user, so the provider reads the user's ID itself: without
 * it no comment maps to `me`, and the person's own message moves to the left
 * once Paperclip confirms it (`paperclip-client.own-messages`).
 */
export class SignedInUser {
  readonly #reader: PaperclipReader;
  #id: string | undefined;
  /** Whether Paperclip gave a final answer, with or without a user: an agent key has none. */
  #answered = false;

  /** `id` is the user the host named, if any; then no read is ever needed. */
  constructor(reader: PaperclipReader, id: string | undefined) {
    this.#reader = reader;
    this.#id = id;
  }

  /** The user's ID, once the host named it or a read gave it. */
  get id(): string | undefined {
    return this.#id;
  }

  /**
   * Reads the user's ID until Paperclip gives a final answer. Offline, a refused key (401) or a
   * server fault (5xx) is asked again on the next call; an answer without a user (an agent key)
   * or another refusal is final, so `whoAmI` isn't read again on every read and send.
   */
  async know(): Promise<void> {
    if (this.#id === undefined && !this.#answered) await this.read();
  }

  /**
   * Reads whom the key belongs to. Answers only the user's name, never their
   * email; `undefined` while Paperclip can't be reached, refuses the key or
   * fails on its side (a 5xx), so it is worth asking again, and no `name` when
   * Paperclip has none to give. Keeps the user's ID when the answer holds one.
   */
  async read(): Promise<PaperclipUser | undefined> {
    const answer = await this.#reader.send("whoAmI");
    if (answer.kind === "failed") {
      const serverFault = answer.status !== undefined && answer.status >= 500;
      const askLater =
        answer.failure === "offline" || answer.failure === "signed-out" || serverFault;
      this.#answered = !askLater;
      return askLater ? undefined : {};
    }
    this.#answered = true;
    const body = asRecord(answer.body);
    this.#id ??= text(body, "userId");
    const name = text(asRecord(field(body, "user")), "name");
    return name === undefined ? {} : { name };
  }
}
