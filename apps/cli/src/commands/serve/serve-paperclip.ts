// The server engine's Paperclip parts as `serve` mounts them (`cli.commands.serve.messaging-mount`,
// HAL-18809): the messaging over the stored keys (S4) behind the `/api/messaging/*` routes, and
// the sign-in and Disconnect (S5) that store and remove those keys. A sign-in or Disconnect that
// changes a key makes the messaging again before it answers, so the routes use the key of the
// moment without a restart.

import { join } from "node:path";
import type { MessagingPorts, PaperclipKeyPorts } from "@halonicjs/host-server";
import type { SecretStore } from "@halonicjs/ports";
import { openServeMessaging, type ServeMessaging } from "./serve-messaging.ts";
import { ServePaperclipSignIn } from "./serve-paperclip-sign-in.ts";

/** What {@link openServePaperclip} needs. */
export interface ServePaperclipOptions {
  /** The engine workspace's real path. */
  workspace: string;
  /** The serve profile's own secrets file, the only place a Paperclip key is kept. */
  keys: Pick<SecretStore, "get" | "set" | "remove">;
  /** The serve profile's folder; the messaging cache goes in it. */
  profileFolder: string;
  /** Where failures and broken cache files are written; never a key. */
  log: (failure: unknown) => void;
  /** The `fetch` Paperclip is called with; the global one by default. */
  fetch?: typeof fetch;
}

/** The server's Paperclip parts, for the server's ports. */
export interface ServePaperclip {
  /** The sources with a stored key when `serve` started; empty when none is stored. */
  readonly connected: readonly string[];
  /** For `ports.messaging`: one server owner only, never a many-user server. */
  readonly messaging: MessagingPorts;
  /** For `ports.paperclipKeys`: the sign-in and Disconnect. */
  readonly signIn: PaperclipKeyPorts;
}

/** Opens the server's messaging over the stored keys, and the sign-in that stores them. */
export async function openServePaperclip(options: ServePaperclipOptions): Promise<ServePaperclip> {
  const { workspace, keys, log } = options;
  const cacheFolder = join(options.profileFolder, "agent-messaging-cache");
  const network = options.fetch === undefined ? {} : { fetch: options.fetch };
  const messaging = await openServeMessaging({
    workspace,
    keys,
    cacheFolder,
    report: (failure) => log(failure.error),
    warn: log,
    ...network,
  });
  const signIn = new ServePaperclipSignIn({
    workspace,
    keys,
    cacheFolder,
    warn: log,
    report: log,
    ...network,
  });
  return {
    connected: messaging.connected,
    messaging: {
      port: messaging.messaging,
      // No poll loop reads the sources yet (`server.messaging-rate`), so a client's focus report
      // changes nothing until one does; every read still goes to Paperclip at once.
      focus: { report: () => undefined },
    },
    signIn: rebuildingSignIn(signIn, messaging, log),
  };
}

/**
 * The sign-in, with the messaging made again after every poll that stored a key and every
 * Disconnect that removed one, before the answer goes out. When making it again fails, the key
 * change stands and the answer says so; the failure goes to the log, and the routes keep the
 * messaging from before until the next sign-in or Disconnect.
 */
function rebuildingSignIn(
  signIn: ServePaperclipSignIn,
  messaging: ServeMessaging,
  log: (failure: unknown) => void,
): PaperclipKeyPorts {
  const rebuild = (connection: string) => messaging.rebuild(connection).catch(log);
  return {
    start: (request) => signIn.start(request),
    poll: async (signInId) => {
      const state = await signIn.poll(signInId);
      if (state.status === "connected") await rebuild(state.connection);
      return state;
    },
    cancel: (signInId) => signIn.cancel(signInId),
    disconnect: async (connection) => {
      const done = await signIn.disconnect(connection);
      if (done.outcome === "disconnected") await rebuild(connection);
      return done;
    },
  };
}
