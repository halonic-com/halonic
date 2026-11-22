import { ProposalGoneError } from "@halonicjs/studio-feature-inbox/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { hostProposalDecisionsOf } from "./host-proposals.ts";

const workspace = "/work/acme";

/** An agent host that answers every request with `status` and `body`, and records what it was asked. */
function hostAnswering(status: number, body: unknown) {
  const request = vi.fn(async (_route: string, _body: unknown) => ({ status, body }));
  const stream = async () => {
    throw new Error("No streams here.");
  };
  return { request, transport: { request, stream } };
}

verifies("studio.workspace-proposal-remove", () => {
  it("tells the Inbox a proposal is gone when the host says its texts are", async () => {
    const message = "Run 01JD8Q's branch is gone.";
    const { transport } = hostAnswering(409, {
      error: { kind: "proposal_unavailable", message },
    });
    const failure = await hostProposalDecisionsOf(transport, workspace, () => true)
      .accept("01JD8Q", "all")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProposalGoneError);
    expect(failure).toMatchObject({ message });
  });

  it("removes through the host with only the workspace and the run", async () => {
    const { transport, request } = hostAnswering(200, {});
    await hostProposalDecisionsOf(transport, workspace, () => true).remove("01JD8Q");
    expect(request).toHaveBeenCalledWith("POST /v1/proposals/remove", {
      workspace,
      runId: "01JD8Q",
    });
  });

  it("refuses without asking the host while the workspace isn't trusted", async () => {
    const { transport, request } = hostAnswering(200, {});
    const decisions = hostProposalDecisionsOf(transport, workspace, () => false);
    await expect(decisions.remove("01JD8Q")).rejects.toThrow("isn't trusted yet");
    expect(request).not.toHaveBeenCalled();
  });
});
