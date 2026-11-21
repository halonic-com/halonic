import type { ServerResponse } from "node:http";
import { ProposalUnavailableError, type RunProposals } from "@halonicjs/app";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { HostProposalFolders } from "./host-proposals.ts";
import { decideBody, listBody, restoreBody, settleBody } from "./proposal-schemas.ts";
import type { ProposalUndoSteps } from "./proposal-undo-steps.ts";

const unnamed = "The agent host was not told to serve this workspace.";

/**
 * The Inbox's decisions on run proposals over loopback, with the run
 * proposal service of a workspace the launcher named:
 * `POST /v1/proposals/list` answers `{ proposals }`, the open ones newest
 * first; `…/accept` answers what was written, with `undo` the id of its
 * step (`null` when nothing was written); `…/reject` answers `{ undo }`;
 * `…/restore` takes such an id and `to` (`before` for Undo, `after` for
 * Redo) and answers what it left alone; `…/settle` answers
 * `{ result: "settled" | "open" }` and drops a settled proposal's steps.
 *
 * A workspace the launcher didn't name is 404 `unknown_workspace`, a run
 * with no proposal 404 `unknown_proposal`, an undo id the host doesn't keep
 * for that workspace 404 `unknown_undo`, a proposal whose texts are gone
 * 409 `proposal_unavailable`, and anything else the service refuses 422
 * `proposal_refused` with the reason.
 */
export function proposalDecisionRoutes(
  proposals: HostProposalFolders,
  steps: ProposalUndoSteps,
): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/proposals/list",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, listBody);
        if (body === undefined) return;
        await withService(response, proposals, body.workspace, async (service) => {
          sendJson(response, 200, { proposals: await service.list() });
        });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/accept",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, decideBody);
        if (body === undefined) return;
        const { workspace, runId, target } = body;
        await withProposal(response, proposals, workspace, runId, async (service) => {
          const { undo, ...result } = await service.accept(runId, target);
          const id = undo === null ? null : steps.keep(workspace, runId, undo);
          sendJson(response, 200, { ...result, undo: id });
        });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/reject",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, decideBody);
        if (body === undefined) return;
        const { workspace, runId, target } = body;
        await withProposal(response, proposals, workspace, runId, async (service) => {
          const { undo } = await service.reject(runId, target);
          sendJson(response, 200, { undo: steps.keep(workspace, runId, undo) });
        });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/restore",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, restoreBody);
        if (body === undefined) return;
        await withService(response, proposals, body.workspace, async (service) => {
          const step = steps.find(body.workspace, body.undo);
          if (step === undefined) {
            return sendError(response, 404, "unknown_undo", "This change can no longer be undone.");
          }
          sendJson(response, 200, await service.restore(step, body.to));
        });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/settle",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, settleBody);
        if (body === undefined) return;
        const { workspace, runId } = body;
        await withProposal(response, proposals, workspace, runId, async (service) => {
          const result = await service.settle(runId);
          if (result === "settled") steps.dropRun(workspace, runId);
          sendJson(response, 200, { result });
        });
      },
    },
  ];
}

/** Runs `use` with the workspace's service, and answers what it throws. */
async function withService(
  response: ServerResponse,
  proposals: HostProposalFolders,
  workspace: string,
  use: (service: RunProposals) => Promise<void>,
): Promise<void> {
  try {
    const service = await proposals.service(workspace);
    if (service === undefined) return sendError(response, 404, "unknown_workspace", unnamed);
    await use(service);
  } catch (error) {
    if (error instanceof ProposalUnavailableError) {
      return sendError(response, 409, "proposal_unavailable", error.message);
    }
    sendError(response, 422, "proposal_refused", reasonOf(error));
  }
}

/** As {@link withService}, for a run that has a proposal. */
async function withProposal(
  response: ServerResponse,
  proposals: HostProposalFolders,
  workspace: string,
  runId: string,
  use: (service: RunProposals) => Promise<void>,
): Promise<void> {
  await withService(response, proposals, workspace, async (service) => {
    if ((await service.get(runId)) === null) {
      return sendError(response, 404, "unknown_proposal", `Run ${runId} has no proposal.`);
    }
    await use(service);
  });
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
