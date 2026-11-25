import type { MessagingSourceState } from "@halonicjs/ports";
import type { PaperclipRequestName } from "./requests.ts";
import {
  type BodyReader,
  bodyOf,
  type PaperclipAnswer,
  type PaperclipTransport,
  type RequestDetails,
} from "./transport.ts";

/**
 * Sends requests through the transport and keeps the source's state from
 * their answers: online as of the last good answer, offline as of then when
 * the network fails, signed out when Paperclip refuses the key.
 */
export class PaperclipReader {
  readonly #transport: PaperclipTransport;
  readonly #now: () => Date;
  #state: MessagingSourceState;

  constructor(transport: PaperclipTransport, now: () => Date) {
    this.#transport = transport;
    this.#now = now;
    // Nothing was read yet: offline as of now until the first answer.
    this.#state = { kind: "offline", asOf: now().toISOString() };
  }

  /** The source's state after the last request. */
  state(): MessagingSourceState {
    return this.#state;
  }

  /**
   * Sends request `name` and records what its answer says about the source. A good answer is
   * read as JSON, or with `reader` when given.
   */
  async send(
    name: PaperclipRequestName,
    details?: RequestDetails,
    reader?: BodyReader,
  ): Promise<PaperclipAnswer> {
    const answer =
      reader === undefined
        ? await this.#transport.send(name, details)
        : await this.#transport.sendReading(name, details ?? {}, reader);
    this.#note(answer);
    return answer;
  }

  /** The body of read `name`, or a thrown client error when it failed. */
  async read(name: PaperclipRequestName, details?: RequestDetails): Promise<unknown> {
    return bodyOf(name, await this.send(name, details));
  }

  #note(answer: PaperclipAnswer): void {
    if (answer.kind === "ok") {
      this.#state = { kind: "online", asOf: this.#now().toISOString() };
      return;
    }
    if (answer.failure === "signed-out") {
      this.#state = { kind: "signed-out" };
      return;
    }
    if (answer.failure === "offline") {
      // Offline as of the last answer that came, so apps say how old their cache is.
      const asOf = this.#state.kind === "signed-out" ? this.#now().toISOString() : this.#state.asOf;
      this.#state = { kind: "offline", asOf };
    }
  }
}
