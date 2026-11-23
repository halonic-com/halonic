import type { ServerResponse } from "node:http";
import {
  CannotCombineError,
  compareTexts,
  ProposalAlreadyDecidedError,
  ProposalFileUnknownError,
  ProposalUnavailableError,
  type RunProposals,
} from "@halonicjs/app";
import type { ExpectedContent } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { webCryptoDigest } from "./host-profiles.ts";
import type { HostProposalFolders } from "./host-proposals.ts";
import {
  chooseBody,
  compareBody,
  decideBody,
  doneBody,
  listBody,
  removeBody,
  restoreBody,
  settleBody,
} from "./proposal-schemas.ts";
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
 * For Compare, `…/compare` answers a file's `base`, `saved` and `run`
 * texts, with `combined` (`null` when they can't be put together) and
 * `seen`, the saved text's digest; `…/choose` takes that `seen` with
 * `use-run` or `combine-both` and answers as Accept does. `…/remove`
 * removes a proposal whose texts are gone and drops its steps, and
 * `…/done` answers `{ proposals }` settled in the last 30 days.
 *
 * A workspace the launcher didn't name is 404 `unknown_workspace`, a run
 * with no proposal 404 `unknown_proposal`, a file the run doesn't propose
 * 404 `unknown_file`, an undo id the host doesn't keep for that workspace
 * 404 `unknown_undo`, a proposal whose texts are gone 409
 * `proposal_unavailable`, a choice on a file already decided 409
 * `already_decided`, a Combine both of texts that change the same lines 409
 * `cannot_combine`, and anything else the service refuses 422
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
    ...compareRoutes(proposals, steps),
  ];
}

/** The routes behind Compare, Remove and the Done heading. */
function compareRoutes(proposals: HostProposalFolders, steps: ProposalUndoSteps): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/proposals/compare",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, compareBody);
        if (body === undefined) return;
        const { workspace, runId, path } = body;
        await withProposal(response, proposals, workspace, runId, async (service) => {
          const texts = await service.compare(runId, path);
          const { combined } = compareTexts(path, texts.base, texts.saved, texts.run);
          sendJson(response, 200, { ...texts, combined, seen: await seenOf(texts.saved) });
        });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/choose",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, chooseBody);
        if (body === undefined) return;
        const { workspace, runId, path, choice, seen } = body;
        await withProposal(response, proposals, workspace, runId, async (service) => {
          // The schema checked that `seen` is `absent` or a SHA-256 digest.
          const expected = seen as ExpectedContent;
          const { undo, ...result } = await service.choose(runId, path, choice, expected);
          const id = undo === null ? null : steps.keep(workspace, runId, undo);
          sendJson(response, 200, { ...result, undo: id });
        });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/remove",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, removeBody);
        if (body === undefined) return;
        const { workspace, runId } = body;
        await withProposal(response, proposals, workspace, runId, async (service) => {
          await service.removeUnavailable(runId);
          steps.dropRun(workspace, runId);
          sendJson(response, 200, {});
        });
      },
    },
    {
      method: "POST",
      path: "/v1/proposals/done",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, doneBody);
        if (body === undefined) return;
        await withService(response, proposals, body.workspace, async (service) => {
          sendJson(response, 200, { proposals: await service.done() });
        });
      },
    },
  ];
}

/** What Compare showed of the saved file, for `…/choose` to write only over that. */
async function seenOf(saved: string | null): Promise<ExpectedContent> {
  return saved === null ? "absent" : await contentDigest(saved, webCryptoDigest);
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
    if (error instanceof CannotCombineError) {
      return sendError(response, 409, "cannot_combine", error.message);
    }
    if (error instanceof ProposalAlreadyDecidedError) {
      return sendError(response, 409, "already_decided", error.message);
    }
    if (error instanceof ProposalFileUnknownError) {
      return sendError(response, 404, "unknown_file", error.message);
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
