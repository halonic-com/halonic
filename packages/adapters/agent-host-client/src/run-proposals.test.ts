import type { ProposedRecord } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostRunProposals } from "./run-proposals.ts";

const workspace = "/work/acme";

const proposed: ProposedRecord = {
  state: "proposed",
  proposal: {
    runId: "01JD8Q",
    history: "git",
    base: "abc123",
    ref: "refs/halonic/proposals/01JD8Q",
    files: [
      {
        path: "hubs/support/agents/triage.yaml",
        change: "modified",
        base: { digest: "sha256:aa" },
      },
      { path: "notes.md", change: "added", base: "absent" },
    ],
    items: ["triage"],
  },
  finishedAt: "2026-11-21T10:00:00.000Z",
  decisions: { "hubs/support/agents/triage.yaml": "undecided", "notes.md": "undecided" },
};

verifies("agent-host-client.run-proposals", () => {
  describe("list", () => {
    it("sends only the workspace, and gives the host's open proposals", async () => {
      const host = new FakeHost().answer("POST /v1/proposals/list", ok({ proposals: [proposed] }));
      expect(await new AgentHostRunProposals(host, workspace).list()).toEqual([proposed]);
      expect(host.calls).toEqual([{ route: "POST /v1/proposals/list", body: { workspace } }]);
    });

    it("fails with the host's kind when it refuses", async () => {
      const host = new FakeHost().answer(
        "POST /v1/proposals/list",
        refused(404, "unknown_workspace", "The agent host was not told to serve this workspace."),
      );
      const failure = await new AgentHostRunProposals(host, workspace)
        .list()
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ kind: "unknown_workspace" });
    });

    it("fails as answer_invalid when a record isn't a proposal", async () => {
      const running = { state: "running", history: "off", runId: "01JD8Q" };
      const host = new FakeHost().answer("POST /v1/proposals/list", ok({ proposals: [running] }));
      const failure = await new AgentHostRunProposals(host, workspace)
        .list()
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ kind: "answer_invalid" });
    });
  });
});
