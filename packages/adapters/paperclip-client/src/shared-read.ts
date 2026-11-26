/**
 * One read that everyone who needs it while it is under way waits for, instead of each sending
 * their own (`paperclip-client.shared-reads`): the Messenger reads every chat at once, and each
 * chat needs the user and the agents. Once the read settles, the next call reads again.
 */
export class SharedRead<T> {
  #reading: Promise<T> | undefined;

  /** The read under way, or a new one made with `read`. */
  run(read: () => Promise<T>): Promise<T> {
    this.#reading ??= read().finally(() => {
      this.#reading = undefined;
    });
    return this.#reading;
  }
}
