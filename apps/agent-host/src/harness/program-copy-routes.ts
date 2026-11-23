import { s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { HostProgramCopies } from "./host-program-copies.ts";

const unnamed = "The agent host was not told to serve this workspace.";

/** A full object id, SHA-1 or SHA-256, so it can never be read as a git option or a branch name. */
const commit = s.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);

const startBody = s.object({ workspace: absolutePath }).strict();
const openBody = s.object({ workspace: absolutePath, commit }).strict();
const releaseBody = s.object({ workspace: absolutePath, path: absolutePath }).strict();

/**
 * The program copies over loopback, so Studio's window starts a live run's
 * connectors in a copy of the workspace at the run's commit
 * (`agent-host.program-copy-routes`): `POST /v1/program-copies/start` stops
 * the workspace's connectors and sweeps its copies, `…/open` answers
 * `{ path }` of the copy at `commit`, and `…/release` lets go of a copy the
 * host holds. Each takes the workspace; one the launcher didn't name is 404
 * `unknown_workspace` and nothing is made. A copy that can't be made is 422
 * `program_copy_refused` with the reason: the saved folder is never used in
 * its place.
 */
export function programCopyRoutes(copies: HostProgramCopies): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/program-copies/start",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, startBody);
        if (body === undefined) return;
        try {
          if (!(await copies.start(body.workspace))) {
            return sendError(response, 404, "unknown_workspace", unnamed);
          }
          sendJson(response, 200, {});
        } catch (error) {
          sendError(response, 422, "program_copy_refused", reasonOf(error));
        }
      },
    },
    {
      method: "POST",
      path: "/v1/program-copies/open",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, openBody);
        if (body === undefined) return;
        const opened = await copies.open(body.workspace, body.commit);
        if (opened === undefined) return sendError(response, 404, "unknown_workspace", unnamed);
        if ("refused" in opened) {
          return sendError(response, 422, "program_copy_refused", opened.refused);
        }
        sendJson(response, 200, { path: opened.path });
      },
    },
    {
      method: "POST",
      path: "/v1/program-copies/release",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, releaseBody);
        if (body === undefined) return;
        try {
          const released = await copies.release(body.workspace, body.path);
          if (released === "unknown_workspace") {
            return sendError(response, 404, "unknown_workspace", unnamed);
          }
          if (released === "not_held") {
            return sendError(
              response,
              404,
              "unknown_program_copy",
              "The agent host holds no program copy at this path for this workspace.",
            );
          }
          sendJson(response, 200, {});
        } catch (error) {
          sendError(response, 422, "program_copy_refused", reasonOf(error));
        }
      },
    },
  ];
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
