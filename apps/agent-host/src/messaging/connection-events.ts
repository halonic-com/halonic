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
