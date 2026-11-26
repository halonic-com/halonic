import { join } from "node:path";
import { MemoryRecordStore } from "@halonicjs/adapter-memory";
import { PaperclipSignInClient } from "@halonicjs/adapter-paperclip-client";
import { NodeScheduler } from "@halonicjs/adapter-scheduler-node";
import { systemSetTimer } from "@halonicjs/adapter-scheduler-node/node";
import type { MessagingFailure } from "@halonicjs/host-agent-messaging-hub";
import { type PaperclipBinding, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { LiveSync, SyncCounters, SyncScheduler } from "@halonicjs/host-paperclip-sync";
import type { PhoneMessaging, Scheduler, SecretStore } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { phoneWorkspaceMessaging } from "../gateway/phone-workspace.ts";
import { feedbackRoutes } from "../paperclip/feedback-routes.ts";
import { HostKeyStore } from "../paperclip/host-key-store.ts";
import { paperclipKeyRoutes } from "../paperclip/paperclip-key-routes.ts";
import { PaperclipSignIn } from "../paperclip/paperclip-sign-in.ts";
import { paperclipSignInRoutes } from "../paperclip/paperclip-sign-in-routes.ts";
import { webCryptoDigest } from "../profile-token-key.ts";
import type { HostRoute } from "../server/host-server.ts";
import {
  readConnectionFile,
  removeConnectionFile,
  writeConnectionFile,
} from "./connection-file.ts";
import { DesktopMessaging } from "./desktop-messaging.ts";
import { MessagingEngineSetting } from "./messaging-engine-setting.ts";
import { messagingRoutes } from "./messaging-routes.ts";
import { paperclipFeedback } from "./paperclip-provider.ts";
import { ReplyWatch } from "./reply-watch.ts";
import { ServerPairings } from "./server-engine.ts";
import { ServerEnginePairing } from "./server-pairing.ts";
import { serverPairingRoutes } from "./server-pairing-routes.ts";
import { syncDiagnosticsRoute } from "./sync-diagnostics-route.ts";

/** The host's agent messaging: its routes, and what stops it. */
export interface HostMessaging {
  routes: HostRoute[];
  /** What a paired phone reads: the workspace Studio last asked for. Without a profile folder or a workspace there is none. */
  phone?: PhoneMessaging;
  stop(): Promise<void>;
}

/** The messaging cache's folder in the profile, which is never a workspace. */
export const messagingCacheFolderName = "agent-messaging-cache";

/**
 * The desktop engine's agent messaging, for the agent host: the key
 * hand-over, Paperclip's sign-in, Studio's messaging routes and Disconnect,
 * the sync's counters and their diagnostics route (`agent-host.sync-diagnostics`),
 * feedback's sender, and the sync's polls and the sign-ins' time limits on a scheduler of its own. Without a profile folder there is nowhere outside
 * the workspaces for the cache, so only the hand-over and feedback's sender
 * are served and no provider ever starts.
 *
 * Each workspace's messaging engine is read from the profile; a server's
 * device token comes from `pairingSecrets`, the host's keychain, and
 * without one a workspace set to a server reads as signed out and the
 * pairing routes answer 409 `keychain_needed`.
 *
 * The sync starts with the host, with its first full load at once, but reads
 * only connected sources, and none is connected until Studio hands a key
 * over, so a host that starts calls nobody. Each connected source's live
 * events then bring reads forward (`agent-host.paperclip-live-events`); until
 * every source's are connected, it polls at the rates without events.
 */
export function hostMessaging(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
  log: (text: string) => void,
  pairingSecrets?: SecretStore,
): HostMessaging {
  const keys = new PaperclipKeys();
  const feedback = feedbackRoutes({
    workspaceRoots,
    senderFor: (binding: PaperclipBinding) =>
      paperclipFeedback({
        binding,
        keys,
        readNow: () => readConnectionFile(binding.workspace, binding.connection),
      }),
    log,
  });
  if (profile === undefined) {
    return {
      routes: [...paperclipKeyRoutes({ keys, workspaceRoots, log }), ...feedback],
      stop: async () => {},
    };
  }
  const report = (failure: MessagingFailure) =>
    log(
      `Agent messaging: ${failure.provider} failed ${failure.action}: ${describe(failure.error)}\n`,
    );
  const warn = (message: string) => log(`Agent messaging engine: ${message}\n`);
  const setting = new MessagingEngineSetting({ profile, digest: webCryptoDigest, warn });
  const counters = new SyncCounters({ clock: systemClock, log });
  const messaging = new DesktopMessaging({
    counters,
    live: {
      add: (id, open) => live.add(id, open),
      remove: (id) => live.remove(id),
      countersFor: (id, kept) => live.countersFor(id, kept),
    },
    keys,
    engines: { setting, pairings: new ServerPairings(pairingSecrets), warn },
    cacheRoot: join(profile.root, messagingCacheFolderName),
    workspaceRoots,
    readConnection: readConnectionFile,
    report,
    warn: (message) => log(`Agent messaging cache: ${message}\n`),
  });
  const scheduler = new NodeScheduler(
    {
      // Each timer is the sync's poll, its events' batch or reconnect, or a sign-in's time limit; each checks its own key.
      onTimer: async (timer) => {
        if (await sync.onTimer(timer)) return;
        if (await live.onTimer(timer)) return;
        await signIn.onTimer(timer);
      },
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
  const replies = new ReplyWatch({
    clock: systemClock,
    report: (error) => report({ provider: "messaging", action: "watch replies", error }),
  });
  const sync = new SyncScheduler({
    scheduler,
    clock: systemClock,
    poll: async () => {
      await live.poll(() => messaging.refresh());
      counters.tick();
    },
    waiting: () => replies.waiting(),
  });
  const live = new LiveSync({
    scheduler,
    clock: systemClock,
    sync,
    counters,
    report: (error) => report({ provider: "paperclip", action: "live events", error }),
  });
  const signIn = hostSignIn(keys, messaging, scheduler, sync);
  const usesServer = (workspace: string) => messaging.usesServer(workspace);
  sync.start().catch((error: unknown) => report({ provider: "scheduler", action: "start", error }));
  return {
    routes: [
      ...paperclipKeyRoutes({
        keys,
        workspaceRoots,
        kept: async ({ workspace, connection }) =>
          (await messaging.of(workspace))?.connect(connection),
        log,
        usesServer,
      }),
      ...messagingRoutes({ messaging, sync, replies, log }),
      syncDiagnosticsRoute(counters),
      ...paperclipSignInRoutes({ signIn, workspaceRoots, log, usesServer }),
      ...feedback,
      ...serverPairingRoutes({
        messaging,
        pairing:
          pairingSecrets === undefined
            ? undefined
            : new ServerEnginePairing({ messaging, setting, keychain: pairingSecrets, log }),
        log,
      }),
    ],
    ...(workspaceRoots.length === 0
      ? {}
      : { phone: phoneWorkspaceMessaging(() => messaging.lastAsked()) }),
    stop: async () => {
      await live.stop();
      await sync.stop();
      await scheduler.close();
      messaging.close();
    },
  };
}

/**
 * Paperclip's sign-in on the host's scheduler: an approved key is kept in
 * memory for its connection, whose file is written first when it is new,
 * and starts the connection's provider, which the sync then polls at once
 * (`agent-host.paperclip-first-poll`).
 */
function hostSignIn(
  keys: PaperclipKeys,
  messaging: DesktopMessaging,
  scheduler: Scheduler,
  sync: Pick<SyncScheduler, "pollNow">,
): PaperclipSignIn {
  return new PaperclipSignIn({
    callsFor: (address) => new PaperclipSignInClient({ address }),
    keyStore: new HostKeyStore({
      keep: (entry) =>
        keys.replace(
          { workspace: entry.workspace, connection: entry.name },
          { key: entry.key, address: entry.address, company: entry.companyId },
        ),
      connect: async (workspace, name) => {
        await (await messaging.of(workspace))?.connect(name);
        await sync.pollNow();
      },
      readConnection: readConnectionFile,
      writeConnection: writeConnectionFile,
      // Forgotten first, so Disconnect's own revoke has no key to send: the sign-in revoked it.
      forget: async (workspace, name) => {
        keys.forget({ workspace, connection: name });
        await (await messaging.of(workspace))?.disconnect(name);
      },
      removeConnection: removeConnectionFile,
    }),
    scheduler,
    clock: systemClock,
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "an unknown error";
}
