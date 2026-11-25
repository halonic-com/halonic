import { runExecutorVersion } from "@halonicjs/ports";
import type { ServerConfig } from "./api.ts";

/**
 * The oldest Studio that speaks this server's protocol. A fixed floor, not the
 * server's own version: raise it only when a change breaks what an older Studio sends or reads.
 */
export const minStudioVersion = "0.1.0";

/** Who a server is for: one owner with a password, or many end users signed in through Cloud. */
export type ServerMode = "owner" | "many";

/**
 * `GET /api/hello`, the one route that answers without a sign-in: the Android app calls it
 * before it opens the login, and Studio before it attaches to the server.
 */
export function helloResponse(config: ServerConfig, mode: ServerMode): Response {
  return Response.json({
    product: "halonic",
    version: config.version,
    minAppVersion: config.minAppVersion,
    // So a remote executor can tell whether this host honors what a version 2 `send` names.
    runExecutorVersion,
    // So Studio attaches only to an owner's server, never to a product's many-user server.
    mode,
    minStudioVersion,
  });
}
