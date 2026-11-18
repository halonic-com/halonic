import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { HostProposalFolders } from "./host-proposals.ts";
import { endBody, folderOfBody, openBody, startBody } from "./proposal-schemas.ts";

const unnamed = "The agent host was not told to serve this workspace.";

/**
 * The run proposal folders over loopback, so Studio can give the engine a
 * `RunProposalFolders` whose folders are made next to the sandbox:
 * `POST /v1/proposals/open` answers `{ folder }`, `…/folder-of` answers
 * `{ folder }` (`null` when the run has none), `…/end` and `…/start` answer `{}`.
 * Each takes the workspace; one the launcher didn't name is 404
 * `unknown_workspace` and nothing is made. A folder that can't be made is 422
 * `proposal_refused` with the reason, so the run doesn't start.
 */
export function proposalRoutes(proposals: HostProposalFolders): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/proposals/open",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, openBody);
        if (body === undefined) return;
        try {
          const folder = await proposals.open(body.workspace, body.run);
          if (folder === undefined) return sendError(response, 404, "unknown_workspace", unnamed);
          sendJson(response, 200, { folder });
        } catch (error) {
          sendError(response, 422, "proposal_refused", reasonOf(error));
        }
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/folder-of",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, folderOfBody);
        if (body === undefined) return;
        const folder = await proposals.folderOf(body.workspace, body.runId);
        if (folder === undefined) return sendError(response, 404, "unknown_workspace", unnamed);
        sendJson(response, 200, { folder });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/end",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, endBody);
        if (body === undefined) return;
        if (!(await proposals.end(body.workspace, body.runId))) {
          return sendError(response, 404, "unknown_workspace", unnamed);
        }
        sendJson(response, 200, {});
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/start",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, startBody);
        if (body === undefined) return;
        try {
          if (!(await proposals.start(body.workspace, new Set(body.openRuns)))) {
            return sendError(response, 404, "unknown_workspace", unnamed);
          }
          sendJson(response, 200, {});
        } catch (error) {
          sendError(response, 422, "proposal_refused", reasonOf(error));
        }
      },
    },
  ];
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
