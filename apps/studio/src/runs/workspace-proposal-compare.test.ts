import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { hostProposalDecisionsOf } from "./host-proposals.ts";

const workspace = "/work/acme";
const seen = `sha256:${"a".repeat(64)}`;

/** An agent host that answers every request with 200 and `body`, and records what it was asked. */
function hostAnswering(body: unknown) {
  const request = vi.fn(async (_route: string, _body: unknown) => ({ status: 200, body }));
  const stream = async () => {
    throw new Error("No streams here.");
  };
  return { request, transport: { request, stream } };
}

verifies("studio.workspace-proposal-compare", () => {
  it("gives both texts and whether they can be combined", async () => {
    const texts = { base: "a\n", saved: "mine\n", run: "run\n", combined: null, seen };
    const { transport } = hostAnswering(texts);
    const decisions = hostProposalDecisionsOf(transport, workspace, () => true);
    expect(await decisions.compare("01JD8Q", "notes.md")).toEqual({
      saved: "mine\n",
      run: "run\n",
      canCombine: false,
      seen,
    });
  });

  it("sends the choice and what Compare showed, never a text", async () => {
    const answer = { undo: "u1", written: ["notes.md"], changedOnDisk: [], refused: [] };
    const { transport, request } = hostAnswering(answer);
    const decisions = hostProposalDecisionsOf(transport, workspace, () => true);
    const decided = await decisions.choose("01JD8Q", "notes.md", "use-run", seen);
    expect(decided).toEqual({ undo: "u1", changedSinceRun: [], cantBeWritten: [] });
    expect(request).toHaveBeenCalledWith("POST /v1/proposals/choose", {
      workspace,
      runId: "01JD8Q",
      path: "notes.md",
      choice: "use-run",
      seen,
    });
  });

  it("refuses without asking the host while the workspace isn't trusted", async () => {
    const { transport, request } = hostAnswering({});
    const decisions = hostProposalDecisionsOf(transport, workspace, () => false);
    await expect(decisions.compare("01JD8Q", "notes.md")).rejects.toThrow("isn't trusted yet");
    expect(request).not.toHaveBeenCalled();
  });
});
