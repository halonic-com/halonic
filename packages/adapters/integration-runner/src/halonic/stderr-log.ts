// The runner's stderr goes to the integration's own log, through the kit's
// secret filter, cut at a limit per call. The rest is read and dropped, so a
// flood can't fill Halonic's memory or block the runner (A21), and counted,
// so the log says how much is missing.

import { removeSecretsStream, type SecretForms } from "@halonicjs/adapter-integration-kit";

/** Passes the runner's stderr on, filtered and cut. */
export class StderrLog {
  readonly #maxBytesPerCall: number;
  readonly #write: (text: string) => void;
  #keptBytes = 0;
  #droppedBytes = 0;

  constructor(maxBytesPerCall: number, write: (text: string) => void) {
    this.#maxBytesPerCall = maxBytesPerCall;
    this.#write = write;
  }

  /** A call starts: the limit counts again from zero. */
  newCall(): void {
    this.#reportDropped();
    this.#keptBytes = 0;
  }

  /**
   * Reads the stream to its end. Resolves when it ends, also when it fails,
   * because a broken stderr says nothing more about the runner than its exit.
   */
  async pump(stderr: ReadableStream<Uint8Array>, secrets: SecretForms): Promise<void> {
    const decoder = new TextDecoder();
    try {
      for await (const piece of stderr.pipeThrough(removeSecretsStream(secrets))) {
        const room = Math.max(0, this.#maxBytesPerCall - this.#keptBytes);
        const kept = piece.subarray(0, room);
        this.#keptBytes += kept.byteLength;
        this.#droppedBytes += piece.byteLength - kept.byteLength;
        if (kept.byteLength > 0) this.#write(decoder.decode(kept, { stream: true }));
      }
    } catch {
      // The runner has gone; its exit is what Halonic reports.
    }
    const rest = decoder.decode();
    if (rest !== "") this.#write(rest);
    this.#reportDropped();
  }

  #reportDropped(): void {
    if (this.#droppedBytes === 0) return;
    this.#write(`\n[${this.#droppedBytes} bytes of output dropped]\n`);
    this.#droppedBytes = 0;
  }
}
