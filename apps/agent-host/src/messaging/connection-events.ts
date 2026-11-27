import { basename } from "node:path";
import { paperclipSourceId } from "@halonicjs/adapter-paperclip-client";
import type { SyncCounters } from "@halonicjs/host-paperclip-sync";
import { type PaperclipProviderOptions, paperclipEvents } from "./paperclip-provider.ts";
import type { WorkspaceMessagingOptions } from "./workspace-messaging.ts";

/** What a workspace's connection needs to follow its live events. */
type EventsOptions = Pick<
  WorkspaceMessagingOptions,
  "cacheFolder" | "live" | "openEvents" | "report" | "counters"
>;

/**
 * Follows a connection's live events with the key just handed over (`agent-host.paperclip-live-events`),
 * replacing the socket of the key before, so a key that was refused is tried again. A connection
 * with no provider (`made` is `undefined`) follows none.
 */
export async function followEvents(
  options: EventsOptions,
  connection: string,
  made: PaperclipProviderOptions | undefined,
): Promise<void> {
  const { live, report } = options;
  if (live === undefined) return;
  const openEvents =
    options.openEvents ??
    ((provider: PaperclipProviderOptions) =>
      paperclipEvents(provider, (error) =>
        report({ provider: paperclipSourceId(connection), action: "live events", error }),
      ));
  const open = made === undefined ? undefined : openEvents(made);
  const id = liveIdOf(options, connection);
  if (open === undefined) await live.remove(id);
  else await live.add(id, open);
}

/**
 * Each connected connection's live events in one workspace. While the workspace's engine is a
 * server its Paperclip sockets are closed, since nothing reads the local copies they announce
 * changes to; back on "This computer" each connection kept meanwhile opens a new one.
 */
export class ConnectionEvents {
  readonly #options: EventsOptions;
  /** What opens each connected connection's socket, kept while the sockets are closed. */
  readonly #made = new Map<string, PaperclipProviderOptions>();
  #closed: boolean;

  /** `closed` is whether the workspace starts on a server. */
  constructor(options: EventsOptions, closed: boolean) {
    this.#options = options;
    this.#closed = closed;
  }

  /**
   * Follows `connection`'s events with the key just handed over, or none when `made` is `undefined`.
   * A socket that fails to open or close is reported, not thrown: events are best-effort, so the
   * hand-over still keeps the key and Disconnect still deletes the cache.
   */
  async follow(connection: string, made: PaperclipProviderOptions | undefined): Promise<void> {
    if (made === undefined) this.#made.delete(connection);
    else this.#made.set(connection, made);
    await this.#followReported(connection, this.#closed ? undefined : made);
  }

  /**
   * Closes every connection's socket while the engine is a server, and opens each again after.
   * A socket that fails to close or open is reported, not thrown, so the other connections still
   * switch and the engine switch itself goes on (leaving a server still deletes its cache).
   */
  async setClosed(closed: boolean): Promise<void> {
    if (closed === this.#closed) return;
    this.#closed = closed;
    for (const [connection, made] of this.#made) {
      await this.#followReported(connection, closed ? undefined : made);
    }
  }

  /**
   * The connections, among those followed now, whose live events (by their {@link liveIdOf} names
   * in `ids`) touched the local copy (`agent-host.paperclip-event-notice`). The workspace names
   * them on `changes` before the read the events bring ends, which can take seconds: Studio then
   * reads an open chat's messages, a live read, at once, and the lists again once the read ends.
   */
  heard(ids: readonly string[]): string[] {
    if (this.#closed) return [];
    return [...this.#made.keys()].filter((connection) =>
      ids.includes(liveIdOf(this.#options, connection)),
    );
  }

  /** {@link followEvents}, reporting a failure instead of throwing it; without events the sync polls. */
  async #followReported(
    connection: string,
    made: PaperclipProviderOptions | undefined,
  ): Promise<void> {
    try {
      await followEvents(this.#options, connection, made);
    } catch (error) {
      const provider = paperclipSourceId(connection);
      this.#options.report({ provider, action: "live events", error });
    }
  }
}

/**
 * The counters for the connection's local copy: a change a read applies after an event announced
 * it counts as `event`, not `poll`.
 */
export function liveCounters(
  options: EventsOptions,
  connection: string,
): Pick<SyncCounters, "applied"> | undefined {
  const { live, counters } = options;
  if (live === undefined || counters === undefined) return counters;
  return live.countersFor(liveIdOf(options, connection), counters);
}

/** The connection's name for its live events: unique across workspaces, short enough for a timer ID. */
export function liveIdOf(options: Pick<EventsOptions, "cacheFolder">, connection: string): string {
  return `${basename(options.cacheFolder)}/${connection}`;
}
