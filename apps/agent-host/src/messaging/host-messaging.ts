import { join } from "node:path";
import { MemoryRecordStore } from "@halonicjs/adapter-memory";
import { PaperclipSignInClient } from "@halonicjs/adapter-paperclip-client";
import { NodeScheduler } from "@halonicjs/adapter-scheduler-node";
import { systemSetTimer } from "@halonicjs/adapter-scheduler-node/node";
import type { MessagingFailure } from "@halonicjs/host-agent-messaging-hub";
import { type PaperclipBinding, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import type { Scheduler, SecretStore } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
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
import { MessagingPoller } from "./messaging-poller.ts";
import { messagingRoutes } from "./messaging-routes.ts";
import { paperclipFeedback } from "./paperclip-provider.ts";
import { ServerPairings } from "./server-engine.ts";

/** The host's agent messaging: its routes, and what stops it. */
export interface HostMessaging {
  routes: HostRoute[];
  stop(): Promise<void>;
}

/** The messaging cache's folder in the profile, which is never a workspace. */
export const messagingCacheFolderName = "agent-messaging-cache";

/**
 * The desktop engine's agent messaging, for the agent host: the key
 * hand-over, Paperclip's sign-in, Studio's messaging routes and Disconnect,
 * feedback's sender, and the poller and the sign-ins' time limits on a scheduler of its own. Without a profile folder there is nowhere outside
 * the workspaces for the cache, so only the hand-over and feedback's sender
 * are served and no provider ever starts.
 *
 * Each workspace's messaging engine is read from the profile; a server's
 * device token comes from `pairingSecrets`, the host's keychain, and
 * without one a workspace set to a server reads as signed out.
 *
 * Polling starts with the host but reads only connected sources, and none is
 * connected until Studio hands a key over, so a host that starts calls
 * nobody.
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
  const messaging = new DesktopMessaging({
    keys,
    engines: {
      setting: new MessagingEngineSetting({ profile, digest: webCryptoDigest, warn }),
      pairings: new ServerPairings(pairingSecrets),
      warn,
    },
    cacheRoot: join(profile.root, messagingCacheFolderName),
    workspaceRoots,
    readConnection: readConnectionFile,
    report,
    warn: (message) => log(`Agent messaging cache: ${message}\n`),
  });
  const scheduler = new NodeScheduler(
    {
      // Each timer is the poller's or a sign-in's time limit; each checks its own key.
      onTimer: async (timer) => {
        if (await poller.onTimer(timer)) return;
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
  const poller = new MessagingPoller({
    scheduler,
    clock: systemClock,
    poll: () => messaging.refresh(),
  });
  const signIn = hostSignIn(keys, messaging, scheduler, poller);
  const usesServer = (workspace: string) => messaging.usesServer(workspace);
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
        usesServer,
      }),
      ...messagingRoutes({ messaging, poller, log }),
      ...paperclipSignInRoutes({ signIn, workspaceRoots, log, usesServer }),
      ...feedback,
    ],
    stop: async () => {
      await poller.stop();
      await scheduler.close();
      messaging.close();
    },
  };
}

/**
 * Paperclip's sign-in on the host's scheduler: an approved key is kept in
 * memory for its connection, whose file is written first when it is new,
 * and starts the connection's provider, which the poller then reads at once
 * (`agent-host.paperclip-first-poll`).
 */
function hostSignIn(
  keys: PaperclipKeys,
  messaging: DesktopMessaging,
  scheduler: Scheduler,
  poller: Pick<MessagingPoller, "pollNow">,
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
        await poller.pollNow();
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
