import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

type CommandHandler = (args: Record<string, unknown>) => unknown;

/**
 * The shell's side of the IPC, in memory: the callback table channels are
 * made of, and the commands a test answers. A command no test answers
 * rejects, as the shell rejects a command the page may not call.
 */
export class FakeShell implements TauriIpc, TauriCallbacks {
  readonly calls: { command: string; args: Record<string, unknown> }[] = [];
  readonly #callbacks = new Map<number, (message: unknown) => void>();
  readonly #handlers = new Map<string, CommandHandler>();
  #nextCallback = 1;

  answer(command: string, handler: CommandHandler): this {
    this.#handlers.set(command, handler);
    return this;
  }

  /** Every command the transport calls has arguments, so `args` is always there. */
  async invoke(command: string, args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    const handler = this.#handlers.get(command);
    if (handler === undefined) throw `command ${command} not allowed`;
    return handler(args);
  }

  transformCallback(callback: (message: unknown) => void): number {
    const id = this.#nextCallback++;
    this.#callbacks.set(id, callback);
    return id;
  }

  unregisterCallback(id: number): void {
    this.#callbacks.delete(id);
  }

  /** Whether the callback a channel argument names is still registered. */
  registered(argument: string): boolean {
    return this.#callbacks.has(callbackId(argument));
  }

  /** Sends a raw message to the channel `argument` names, as the shell does; to a removed one it goes nowhere. */
  send(argument: string, raw: unknown): void {
    this.#callbacks.get(callbackId(argument))?.(raw);
  }

  /** The calls of one command. */
  callsOf(command: string): Record<string, unknown>[] {
    return this.calls.filter((call) => call.command === command).map((call) => call.args);
  }
}

function callbackId(argument: string): number {
  return Number(argument.slice("__CHANNEL__:".length));
}
