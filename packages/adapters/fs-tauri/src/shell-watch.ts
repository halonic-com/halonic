import { DigestWatch, type WatchEvents } from "@halonicjs/adapter-watch-kit";
import type { DefinitionSource, DefinitionWatchListener } from "@halonicjs/ports";
import { KindedError, type Sha256 } from "@halonicjs/std";
import type { TauriChannelHandle } from "./file-commands.ts";

/** The shell's id for an open `fs_watch`, which `fs_unwatch` takes back. */
export type WatchId = number;

/** How the shell's `fs_watch` is started and stopped; the store wraps its commands. */
export interface ShellWatchEvents {
  /** Opens a channel for the shell's messages. */
  openChannel(onMessage: (message: unknown) => void): TauriChannelHandle;
  /** Calls `fs_watch` with the channel and gives the watch's id. */
  start(channel: TauriChannelHandle): Promise<WatchId>;
  /** Calls `fs_unwatch`. */
  stop(watchId: WatchId): Promise<void>;
}

/** How a watch through the shell reads the workspace and hears the shell. */
export interface ShellWatchOptions {
  /** The store's read side, which checks paths as the port says. */
  readonly files: DefinitionSource;
  readonly digest: Sha256;
  readonly events: ShellWatchEvents;
  /** The store's open watches, as {@link DigestWatch} keeps them. */
  readonly openWatches: Set<DigestWatch>;
}

/**
 * A watch of a workspace through the shell's `fs_watch`: the kit's
 * {@link DigestWatch}, hearing the shell's channel. The shell only says
 * which files may have changed; the watch reads each of them and compares
 * its digest with the one it last saw, as in `fs-node` and `fs-web`.
 */
export const ShellWatch = {
  /**
   * Starts the shell's watch, then reads every file's digest. Rejects, with
   * nothing left listening, when the shell refuses to watch or the
   * workspace can't be read.
   */
  async open(options: ShellWatchOptions, listener: DefinitionWatchListener): Promise<DigestWatch> {
    const channel = await ShellChannel.start(options.events);
    return await DigestWatch.open(
      {
        files: options.files,
        digest: options.digest,
        events: channel.events,
        // The shell already gathers the changes it sees each time it looks.
        quietMs: 0,
        openWatches: options.openWatches,
      },
      listener,
    );
  },
};

/**
 * The shell's channel for one `fs_watch`, as the kit's {@link WatchEvents}.
 * The channel opens before `fs_watch` is called, so no change is missed;
 * messages that come before the kit listens wait for it.
 */
class ShellChannel {
  /** The shell's messages, for the kit; stopping them closes the channel and the shell's watch. */
  readonly events: WatchEvents;

  readonly #events: ShellWatchEvents;
  readonly #channel: TauriChannelHandle;
  #watchId: WatchId | undefined;
  /** Where messages go: kept until the kit listens, then the kit's handlers. */
  #deliver: (message: unknown) => void;

  private constructor(events: ShellWatchEvents) {
    this.#events = events;
    const early: unknown[] = [];
    this.#deliver = (message) => early.push(message);
    this.#channel = events.openChannel((message) => this.#deliver(message));
    this.events = (noticed, failed) => {
      this.#deliver = (message) => receive(message, noticed, failed);
      // The kit only takes its stop function once this returns, so the messages kept wait a turn.
      queueMicrotask(() => {
        for (const message of early.splice(0)) {
          this.#deliver(message);
        }
      });
      return () => this.#stop();
    };
  }

  /** Opens the channel and starts the shell's watch on it; closes the channel when the shell refuses. */
  static async start(events: ShellWatchEvents): Promise<ShellChannel> {
    const shellChannel = new ShellChannel(events);
    try {
      shellChannel.#watchId = await events.start(shellChannel.#channel);
    } catch (error) {
      await shellChannel.#stop();
      throw error;
    }
    return shellChannel;
  }

  /**
   * Closes the channel, then resolves once the shell's `fs_unwatch` has
   * answered. Called once: by the kit, which stops its events only once, or
   * when the shell refuses to watch, before the kit has them.
   */
  async #stop(): Promise<void> {
    this.#deliver = () => {};
    this.#channel.close();
    if (this.#watchId === undefined) {
      return;
    }
    try {
      await this.#events.stop(this.#watchId);
    } catch {
      // The channel is closed, so nothing more is heard from the shell either way.
    }
  }
}

/** Passes one of the shell's watch messages on to the kit. */
function receive(
  message: unknown,
  noticed: (name: string) => void,
  failed: (error: Error) => void,
): void {
  const { type, paths, message: reason } = (message ?? {}) as Record<string, unknown>;
  if (type === "changed" && Array.isArray(paths) && paths.every(isString)) {
    for (const path of paths) {
      noticed(path);
    }
  } else if (type === "failed" && typeof reason === "string") {
    failed(new KindedError("unavailable", `The workspace watch stopped: ${reason}`));
  } else {
    failed(
      new KindedError("unavailable", "The desktop shell sent a watch message that isn't one."),
    );
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
