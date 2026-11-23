import { runExecutorVersion } from "@halonicjs/ports";
import type { ServerConfig } from "./api.ts";

/**
 * `GET /api/hello`, the one route that answers without a sign-in: the Android app calls it
 * before it opens the login.
 */
export function helloResponse(config: ServerConfig): Response {
  return Response.json({
    product: "halonic",
    version: config.version,
    minAppVersion: config.minAppVersion,
    // So a remote executor can tell whether this host honors what a version 2 `send` names.
    runExecutorVersion,
  });
}
