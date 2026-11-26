// The local request log of a workspace's integration, read for Studio's Build
// chat (`read_request_log`, HAL-19291): the CLI's engine writes it in the
// profile, which a page can't read. The route only reads; this host never
// writes a log, so its store shares no write with the CLI's.

import { requestLogFilesIn } from "@halonicjs/adapter-fs-node";
import { RequestLogStore } from "@halonicjs/app";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { s } from "@halonicjs/schema-kit";
import { webCryptoDigest } from "../harness/host-profiles.ts";
import { absolutePath } from "../sandbox/profile-schema.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { namedWorkspace } from "../server/named-workspace.ts";

/** The workspace's real path and the integration's id, as its permission sheet names it. */
const readBody = s
  .object({ location: absolutePath, integration: s.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/) })
  .strict();

const unnamed = "The agent host was not told to serve this workspace.";
/** The whole answer to a log that can't be read: the cause could hold the log's own text. */
const unreadable = "The request log can't be read.";

/**
 * `POST /v1/integration-logs/read`: answers `{ lines }`, the integration's
 * log oldest first, read under the key of the workspace the body names, and
 * no other's. A location that isn't the real path of a workspace the launcher
 * named is 404 `unknown_workspace`, and nothing is read. A log that can't be
 * read is 422 `request_log_unreadable` with a fixed sentence. Without a
 * profile folder there is no log, and no route.
 */
export function requestLogRoutes(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
): HostRoute[] {
  if (profile === undefined) return [];
  const store = new RequestLogStore(requestLogFilesIn(profile.root));
  return [
    {
      method: "POST",
      path: "/v1/integration-logs/read",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, readBody);
        if (body === undefined) return;
        if ((await namedWorkspace(workspaceRoots, body.location)) !== body.location) {
          return sendError(response, 404, "unknown_workspace", unnamed);
        }
        try {
          const { key } = await workspaceFolders(profile, body.location, webCryptoDigest);
          sendJson(response, 200, { lines: await store.lines(key, body.integration) });
        } catch {
          sendError(response, 422, "request_log_unreadable", unreadable);
        }
      },
    },
  ];
}
