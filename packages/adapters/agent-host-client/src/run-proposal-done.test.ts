import type { ProposedRecord } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostRunProposals } from "./run-proposals.ts";

const workspace = "/work/acme";

const settled: ProposedRecord = {
  state: "proposed",
  proposal: {
    runId: "01JD8Q",
    history: "off",
    base: null,
    ref: null,
    files: [{ path: "notes.md", change: "added", base: "absent" }],
    items: ["triage"],
  },
  finishedAt: "2026-11-20T10:00:00.000Z",
  decisions: { "notes.md": "accepted" },
  settled: { at: "2026-11-21T09:00:00.000Z", why: "decided" },
};

verifies("agent-host-client.run-proposal-done", () => {
  it("sends only the workspace, and gives the settled records with when and why", async () => {
    const host = new FakeHost().answer("POST /v1/proposals/done", ok({ proposals: [settled] }));
    expect(await new AgentHostRunProposals(host, workspace).done()).toEqual([settled]);
    expect(host.calls).toEqual([{ route: "POST /v1/proposals/done", body: { workspace } }]);
  });

  it("fails with the host's kind when it refuses", async () => {
    const host = new FakeHost().answer(
      "POST /v1/proposals/done",
      refused(404, "unknown_workspace", "The agent host was not told to serve this workspace."),
    );
    const failure = await new AgentHostRunProposals(host, workspace)
      .done()
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ kind: "unknown_workspace" });
  });

  it("fails as answer_invalid when a record isn't a proposal", async () => {
    const running = { state: "running", history: "off", runId: "01JD8Q" };
    const host = new FakeHost().answer("POST /v1/proposals/done", ok({ proposals: [running] }));
    const failure = await new AgentHostRunProposals(host, workspace)
      .done()
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ kind: "answer_invalid" });
  });
});
