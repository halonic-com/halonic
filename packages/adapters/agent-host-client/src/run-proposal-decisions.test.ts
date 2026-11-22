import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostRunProposals } from "./run-proposals.ts";

const workspace = "/work/acme";
const file = "hubs/support/agents/triage.yaml";

verifies("agent-host-client.run-proposal-decisions", () => {
  describe("accept and reject", () => {
    it("sends only the workspace, the run and the file, and gives the undo id", async () => {
      const accepted = { undo: "u1", written: [file], changedOnDisk: [], refused: [] };
      const host = new FakeHost().answer("POST /v1/proposals/accept", ok(accepted));
      const proposals = new AgentHostRunProposals(host, workspace);
      expect(await proposals.accept("01JD8Q", { file })).toEqual(accepted);
      expect(host.calls).toEqual([
        {
          route: "POST /v1/proposals/accept",
          body: { workspace, runId: "01JD8Q", target: { file } },
        },
      ]);
    });

    it("rejects every undecided file with all", async () => {
      const host = new FakeHost().answer("POST /v1/proposals/reject", ok({ undo: "u2" }));
      expect(await new AgentHostRunProposals(host, workspace).reject("01JD8Q", "all")).toEqual({
        undo: "u2",
      });
      expect(host.calls[0]?.body).toEqual({ workspace, runId: "01JD8Q", target: "all" });
    });

    it("fails as answer_invalid when an accept answer has no undo id", async () => {
      const host = new FakeHost().answer(
        "POST /v1/proposals/accept",
        ok({ written: [file], changedOnDisk: [], refused: [] }),
      );
      const failure = await new AgentHostRunProposals(host, workspace)
        .accept("01JD8Q", { file })
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ kind: "answer_invalid" });
    });
  });

  describe("restore and settle", () => {
    it("undoes with only the workspace, the id and the direction", async () => {
      const host = new FakeHost().answer(
        "POST /v1/proposals/restore",
        ok({ changedOnDisk: [], refused: [] }),
      );
      await new AgentHostRunProposals(host, workspace).restore("u1", "before");
      expect(host.calls).toEqual([
        { route: "POST /v1/proposals/restore", body: { workspace, undo: "u1", to: "before" } },
      ]);
    });

    it("fails with the host's kind when the undo id is unknown", async () => {
      const host = new FakeHost().answer(
        "POST /v1/proposals/restore",
        refused(404, "unknown_undo", "This change can no longer be undone."),
      );
      const failure = await new AgentHostRunProposals(host, workspace)
        .restore("u1", "before")
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ kind: "unknown_undo" });
    });

    it("settles, and gives the host's result", async () => {
      const host = new FakeHost().answer("POST /v1/proposals/settle", ok({ result: "settled" }));
      expect(await new AgentHostRunProposals(host, workspace).settle("01JD8Q")).toBe("settled");
      expect(host.calls[0]?.body).toEqual({ workspace, runId: "01JD8Q" });
    });
  });
});
