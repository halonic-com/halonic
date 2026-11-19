import type { EngineLockRefusal, EngineLockRefusalKind } from "./engine-lock-commands.ts";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { TauriChannelHandle, TauriFileShell } from "./file-commands.ts";

/**
 * A shell that answers the `engine_lock_*` commands as the Rust shell does,
 * written out on its own rather than from the adapter: one lock per opened
 * workspace, held for one window, which asking again keeps and hands its new
 * channel; another holder is refused as `conflict`; a workspace that isn't
 * open as `folder_not_open`. `lose` plays another process taking the lock
 * over.
 *
 * Every call is kept in `calls`.
 */
export class FakeEngineLockShell implements TauriFileShell {
  readonly calls: ShellCall[] = [];
  /** The folders the person opened in the shell. */
  readonly opened: readonly string[];
  /** The workspaces this window holds, by the channel that hears of their loss. */
  readonly #held = new Map<string, string>();
  /** The workspaces another process holds. */
  readonly #foreign = new Set<string>();
  readonly #channels = new Map<string, (message: unknown) => void>();
  #nextChannel = 0;
  #nextRefusal: EngineLockRefusalKind | undefined;

  constructor(options: { opened: readonly string[] }) {
    this.opened = [...options.opened];
  }

  /** Whether this window holds the lock of `workspace`. */
  holds(workspace: string): boolean {
    return this.#held.has(workspace);
  }

  /** How many channels the page has open: one per hold not yet released or lost. */
  get openChannels(): number {
    return this.#channels.size;
  }

  /** Makes another process hold the lock of `workspace`, as the CLI's engine does. */
  holdElsewhere(workspace: string): void {
    this.#foreign.add(workspace);
  }

  /** Makes the next call fail this way, before anything changes. */
  refuseNext(kind: EngineLockRefusalKind): void {
    this.#nextRefusal = kind;
  }

  /** Another process takes the lock of `workspace` over: the shell tells the page that holds it. */
  lose(workspace: string): void {
    const channel = this.#held.get(workspace);
    this.#held.delete(workspace);
    this.#foreign.add(workspace);
    const deliver = channel === undefined ? undefined : this.#channels.get(channel);
    // Tauri delivers a channel's messages later, never inside the call that sent them.
    queueMicrotask(() =>
      deliver?.({ message: "The engine lock was taken over by another process." }),
    );
  }

  /** Sends `message` on `channel`, as the shell would, whatever its shape. */
  sendRaw(channel: string, message: unknown): void {
    const deliver = this.#channels.get(channel);
    queueMicrotask(() => deliver?.(message));
  }

  openChannel(onMessage: (message: unknown) => void): TauriChannelHandle {
    const argument = `__CHANNEL__:${this.#nextChannel++}`;
    this.#channels.set(argument, onMessage);
    return { argument, close: () => this.#channels.delete(argument) };
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (this.#nextRefusal !== undefined) {
      const kind = this.#nextRefusal;
      this.#nextRefusal = undefined;
      throw refusal(kind, `refused by the test (${kind})`);
    }
    const workspace = String(args["workspace"]);
    if (!this.opened.includes(workspace)) {
      throw refusal("folder_not_open", `${workspace} is not an opened folder`);
    }
    if (command === "engine_lock_release") {
      this.#held.delete(workspace);
      return null;
    }
    if (this.#foreign.has(workspace)) {
      throw { ...refusal("conflict", "Another engine is open on this workspace."), pid: 4242 };
    }
    this.#held.set(workspace, String(args["onLost"]));
    return null;
  }
}

function refusal(kind: EngineLockRefusalKind, message: string): EngineLockRefusal {
  return { kind, message };
}
