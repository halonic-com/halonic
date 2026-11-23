import type { TauriCallbacks, TauriIpc } from "@halonicjs/studio-services";

/**
 * The shell's side, in memory: each command answers what the test set, or rejects as a command
 * the page may not call; a channel's messages go to the callback its argument names.
 */
export class FakeShell implements TauriIpc, TauriCallbacks {
  readonly calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  readonly answers = new Map<string, unknown>();
  readonly #callbacks = new Map<number, (message: unknown) => void>();
  #nextCallback = 1;

  async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    if (!this.answers.has(command)) throw `command ${command} not allowed`;
    return this.answers.get(command);
  }

  transformCallback(callback: (message: unknown) => void): number {
    const id = this.#nextCallback++;
    this.#callbacks.set(id, callback);
    return id;
  }

  unregisterCallback(id: number): void {
    this.#callbacks.delete(id);
  }

  /** The commands called, in order. */
  commands(): string[] {
    return this.calls.map((call) => call.command);
  }

  /** Sends `event` as the `index`th message on the channel the last watch handed in. */
  sendEvent(index: number, event: object): void {
    const watch = this.calls.findLast((call) => call.command === "phone_tunnel_watch");
    const argument = String(watch?.args?.["onEvent"]);
    const id = Number(argument.slice("__CHANNEL__:".length));
    this.#callbacks.get(id)?.({ index, message: event });
  }

  /** Sends a computer's status as the `index`th message. */
  sendStatus(index: number, computer: string, status: object): void {
    this.sendEvent(index, { kind: "status", computer, status });
  }

  /** How many channels are still registered. */
  openChannels(): number {
    return this.#callbacks.size;
  }
}
