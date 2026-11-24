import { join } from "node:path";
import { MemoryRecordStore } from "@halonicjs/adapter-memory";
import { NodeScheduler } from "@halonicjs/adapter-scheduler-node";
import { systemSetTimer } from "@halonicjs/adapter-scheduler-node/node";
import type { ProfileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { paperclipKeyRoutes } from "../paperclip/paperclip-key-routes.ts";
import { PaperclipKeys } from "../paperclip/paperclip-keys.ts";
import type { HostRoute } from "../server/host-server.ts";
import { readConnectionFile } from "./connection-file.ts";
import { DesktopMessaging } from "./desktop-messaging.ts";
import type { MessagingFailure } from "./messaging-hub.ts";
import { MessagingPoller } from "./messaging-poller.ts";
import { messagingRoutes } from "./messaging-routes.ts";

/** The host's agent messaging: its routes, and what stops it. */
export interface HostMessaging {
  routes: HostRoute[];
  stop(): Promise<void>;
}

/** The messaging cache's folder in the profile, which is never a workspace. */
export const messagingCacheFolderName = "agent-messaging-cache";

/**
 * The desktop engine's agent messaging, for the agent host: the key
 * hand-over, Studio's messaging routes and Disconnect, and the poller on a
 * scheduler of its own. Without a profile folder there is nowhere outside
 * the workspaces for the cache, so only the hand-over is served and no
 * provider ever starts.
 *
 * Polling starts with the host but reads only connected sources, and none is
 * connected until Studio hands a key over, so a host that starts calls
 * nobody.
 */
export function hostMessaging(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
  log: (text: string) => void,
): HostMessaging {
  const keys = new PaperclipKeys();
  if (profile === undefined) {
    return { routes: paperclipKeyRoutes({ keys, workspaceRoots, log }), stop: async () => {} };
  }
  const report = (failure: MessagingFailure) =>
    log(
      `Agent messaging: ${failure.provider} failed ${failure.action}: ${describe(failure.error)}\n`,
    );
  const messaging = new DesktopMessaging({
    keys,
    cacheRoot: join(profile.root, messagingCacheFolderName),
    workspaceRoots,
    readConnection: readConnectionFile,
    report,
    warn: (message) => log(`Agent messaging cache: ${message}\n`),
  });
  const scheduler = new NodeScheduler(
    {
      onTimer: async (timer) => void (await poller.onTimer(timer)),
      // The poll needs no tick: its own timer brings every poll.
      onTick: async () => {},
    },
    {
      store: new MemoryRecordStore(),
      clock: systemClock,
      setTimer: systemSetTimer,
      reportError: (error) => report({ provider: "scheduler", action: "poll", error }),
    },
  );
  const poller = new MessagingPoller({
    scheduler,
    clock: systemClock,
    poll: () => messaging.refresh(),
  });
  poller
    .start()
    .catch((error: unknown) => report({ provider: "scheduler", action: "start", error }));
  return {
    routes: [
      ...paperclipKeyRoutes({
        keys,
        workspaceRoots,
        kept: async ({ workspace, connection }) =>
          (await messaging.of(workspace))?.connect(connection),
        log,
      }),
      ...messagingRoutes({ messaging, poller, log }),
    ],
    stop: async () => {
      await poller.stop();
      await scheduler.close();
      messaging.close();
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "an unknown error";
}
