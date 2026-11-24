import { workspaceRootsOf } from "./connector-places.ts";
import type { HostIo } from "./host.ts";
import { argumentAfter, logToError, shellChannelOf } from "./host-parts.ts";
import { hostMessaging } from "./messaging/host-messaging.ts";
import { optionalProfileOf } from "./profile-folder.ts";
import { sweepRoots } from "./sandbox/sweep-lock.ts";
import { hostKeychainOf } from "./secrets/host-keychain.ts";
import { healthRoute } from "./server/health-route.ts";
import type { HostRoute } from "./server/host-server.ts";
import { serveHost } from "./serving-modes.ts";

/** The argument that starts the host in messaging-only mode. */
export const messagingOnlyArgument = "--messaging-only";

/** The paths a messaging-only host serves besides `/v1/health`. */
export const messagingOnlyPrefixes = ["/v1/messaging/", "/v1/paperclip/"] as const;

/**
 * The host in messaging-only mode (`--messaging-only`, requirement
 * `agent-host.messaging-only`): agent messaging and Paperclip's sign-in,
 * for Studio's shell to run beside itself on Windows while the harnesses
 * run in Halonic's WSL distro. It serves `GET /v1/health` and the routes
 * under {@link messagingOnlyPrefixes}, and nothing else: no run, harness,
 * sandbox, bridge, connector, model, plugin, file or remote route, so a
 * caller holding this host's token can't start an agent outside the
 * sandbox. Every other path answers 404, as an unknown one does.
 *
 * The workspaces are the `--sweep-root`s, as for the full host, but none is
 * swept: this host takes no profile lock and makes no sandbox. With
 * `--keychain-relay`, the shell names the folders opened later on its
 * channel (requirement `agent-host.opened-workspaces`).
 *
 * @returns the exit code, as the full host's
 */
export async function serveMessagingOnly(
  args: readonly string[],
  version: string,
  io: HostIo,
): Promise<number> {
  const given = sweepRoots(args);
  if ("error" in given) {
    io.writeError(given.error);
    return 2;
  }
  const profileFolder = argumentAfter(args, "--profile-folder");
  const workspaceRoots = workspaceRootsOf(given.roots, profileFolder);
  const profile = optionalProfileOf(profileFolder);
  const log = (text: string) => io.writeError(text);
  const keychain = hostKeychainOf(args, profile, log);
  const channel = shellChannelOf(keychain, workspaceRoots, profileFolder, log);
  const messaging = hostMessaging(profile, workspaceRoots, logToError);
  const host = {
    routes: messagingOnlyRoutes(version, messaging.routes),
    stop: () => messaging.stop(),
    listeningOn: () => {},
  };
  return await serveHost(args, io, host, channel);
}

/**
 * `/v1/health` and the routes of `messaging` under
 * {@link messagingOnlyPrefixes}: a route added to the messaging later under
 * another path is left out, rather than served by this host unnoticed.
 */
export function messagingOnlyRoutes(version: string, messaging: readonly HostRoute[]): HostRoute[] {
  const served = messaging.filter((route) =>
    messagingOnlyPrefixes.some((prefix) => route.path.startsWith(prefix)),
  );
  return [healthRoute(version), ...served];
}
