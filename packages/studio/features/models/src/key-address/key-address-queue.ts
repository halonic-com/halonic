// The "Allow this address?" questions of the open folder (HAL-11873): the
// engine asks, the dialog host draws the first one, and the person's button
// answers it. The page never names the address that is saved: Allow calls the
// engine's own `save`, so all the page can send is Allow or Don't allow.

import type { KeyAddressAnswer, KeyAddressQuestion, KeyAddressQuestions } from "../api.ts";

/** The question the dialog shows, and where it stands. */
export interface ShownKeyAddressQuestion {
  /** Tells this question from any other, also one with the same key and address. */
  readonly id: number;
  readonly question: KeyAddressQuestion;
  /** 1 for the first question waiting. */
  readonly position: number;
  /** How many questions are waiting, this one included. */
  readonly count: number;
  /** Allow was pressed and the address is being saved. */
  readonly saving: boolean;
  /** The last Allow couldn't save the address; the question is still open. */
  readonly saveFailed: boolean;
}

interface Waiting {
  readonly id: number;
  readonly question: KeyAddressQuestion;
  readonly save: () => Promise<boolean>;
  readonly answer: (answer: KeyAddressAnswer) => void;
  readonly drop: () => void;
}

/**
 * The questions waiting for an answer, in the order they came. Only the first is shown; the
 * next shows once it is answered or its wait ends.
 *
 * @example
 * const queue = new KeyAddressQueue();
 * const answer = queue.ask(question, { save, signal });
 * queue.shown; // { id: 1, question, position: 1, count: 1, saving: false, saveFailed: false }
 * await queue.refuse(); // answer resolves "not-allowed"
 */
export class KeyAddressQueue implements KeyAddressQuestions {
  readonly #waiting: Waiting[] = [];
  readonly #listeners = new Set<() => void>();
  #nextId = 1;
  #saving = false;
  #saveFailed = false;
  #shown: ShownKeyAddressQuestion | undefined;

  /** The question the dialog shows, or `undefined` when none is waiting. The same object until something changes. */
  get shown(): ShownKeyAddressQuestion | undefined {
    return this.#shown;
  }

  ask(
    question: KeyAddressQuestion,
    options: { readonly save: () => Promise<boolean>; readonly signal: AbortSignal },
  ): Promise<KeyAddressAnswer> {
    const { save, signal } = options;
    return new Promise<KeyAddressAnswer>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = () => {
        this.#remove(waiting);
        reject(signal.reason);
      };
      const waiting: Waiting = {
        id: this.#nextId++,
        question,
        save,
        answer: (answer) => {
          signal.removeEventListener("abort", onAbort);
          resolve(answer);
        },
        drop: () => signal.removeEventListener("abort", onAbort),
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.#waiting.push(waiting);
      this.#changed();
    });
  }

  /**
   * Allow on the shown question: saves its address through the engine's `save`. On success the
   * question is answered `allowed` and the next one shows; on failure it stays open with
   * `saveFailed`. Does nothing while a save runs.
   */
  async allow(): Promise<void> {
    const first = this.#waiting[0];
    if (first === undefined || this.#saving) return;
    this.#saving = true;
    this.#saveFailed = false;
    this.#changed();
    const saved = await first.save().catch(() => false);
    this.#saving = false;
    if (this.#waiting[0] !== first) {
      // The wait ended while saving: the run was stopped or the time ran out.
      this.#changed();
      return;
    }
    if (saved) {
      this.#waiting.shift();
      first.answer("allowed");
    } else {
      this.#saveFailed = true;
    }
    this.#changed();
  }

  /** Don't allow, Escape or closing the dialog: answers the shown question `not-allowed`. Not while a save runs. */
  refuse(): void {
    const first = this.#waiting[0];
    if (first === undefined || this.#saving) return;
    this.#waiting.shift();
    this.#saveFailed = false;
    first.answer("not-allowed");
    this.#changed();
  }

  /** Calls `listener` whenever {@link shown} changes; returns a function that stops it. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #remove(waiting: Waiting): void {
    const index = this.#waiting.indexOf(waiting);
    if (index === -1) return;
    this.#waiting.splice(index, 1);
    waiting.drop();
    if (index === 0) this.#saveFailed = false;
    this.#changed();
  }

  #changed(): void {
    const first = this.#waiting[0];
    this.#shown =
      first === undefined
        ? undefined
        : {
            id: first.id,
            question: first.question,
            position: 1,
            count: this.#waiting.length,
            saving: this.#saving,
            saveFailed: this.#saveFailed,
          };
    for (const listener of this.#listeners) listener();
  }
}
