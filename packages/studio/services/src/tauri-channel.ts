import type { TauriCallbacks } from "./tauri-ipc.ts";

/**
 * A Tauri `Channel` as a page reads it: what `@tauri-apps/api`'s `Channel`
 * does, written here because the Studio doesn't take that library. The
 * protocol is Tauri 2.12's, read from its `core.ts`:
 *
 * - The page registers a callback and passes `__CHANNEL__:<id>` as the
 *   command's argument.
 * - The shell calls it with `{ message, index }`, numbered from 0. Messages
 *   can arrive out of order, so a message waits until the ones before it
 *   have come.
 * - When the shell drops the channel it sends `{ end: true, index }`, the
 *   number of messages it sent. The callback is removed once all of them
 *   have come.
 */
export class TauriChannel {
  /** The value the command's channel argument takes. */
  readonly argument: string;
  readonly #callbacks: TauriCallbacks;
  readonly #id: number;
  readonly #onMessage: (message: unknown) => void;
  readonly #waiting = new Map<number, unknown>();
  #next = 0;
  #endIndex: number | undefined;
  #closed = false;

  /** Opens a channel whose messages, in the order sent, go to `onMessage`. */
  constructor(callbacks: TauriCallbacks, onMessage: (message: unknown) => void) {
    this.#callbacks = callbacks;
    this.#onMessage = onMessage;
    this.#id = callbacks.transformCallback((raw) => this.#receive(raw));
    this.argument = `__CHANNEL__:${this.#id}`;
  }

  /** Stops reading: the shell's later messages are dropped. Closing twice is fine. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#waiting.clear();
    this.#callbacks.unregisterCallback(this.#id);
  }

  #receive(raw: unknown): void {
    // Once closed, the callback is unregistered, so nothing more comes here.
    if (!isIndexed(raw)) return;
    if ("end" in raw) {
      this.#endIndex = raw.index;
    } else {
      this.#waiting.set(raw.index, raw.message);
    }
    while (this.#waiting.has(this.#next)) {
      const message = this.#waiting.get(this.#next);
      this.#waiting.delete(this.#next);
      this.#next += 1;
      this.#onMessage(message);
      if (this.#closed) return;
    }
    if (this.#next === this.#endIndex) this.close();
  }
}

type IndexedMessage = { index: number; message: unknown } | { index: number; end: true };

function isIndexed(raw: unknown): raw is IndexedMessage {
  if (typeof raw !== "object" || raw === null) return false;
  const index: unknown = Reflect.get(raw, "index");
  return (
    Number.isSafeInteger(index) && (index as number) >= 0 && ("message" in raw || "end" in raw)
  );
}
