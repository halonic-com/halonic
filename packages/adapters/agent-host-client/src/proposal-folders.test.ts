import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostProposalFolders, type ProposalFolderRun } from "./proposal-folders.ts";
import { AgentHostError } from "./transport.ts";

const workspace = "/work/acme";

const run: ProposalFolderRun = {
  runId: "run_1",
  hubId: "hub_1",
  workflowId: "ship",
  version: { reads: "live-version", commit: "abc123", versionDate: "2026-11-17T10:00:00.000Z" },
};

verifies("agent-host-client.proposal-folders", () => {
  describe("open", () => {
    it("sends the workspace and the run, and gives the host's folder", async () => {
      const host = new FakeHost().answer(
        "POST /v1/proposals/open",
        ok({ folder: "/data/wt/run_1" }),
      );
      const folder = await new AgentHostProposalFolders(host, workspace).open(run);
      expect(folder).toBe("/data/wt/run_1");
      expect(host.calls).toEqual([{ route: "POST /v1/proposals/open", body: { workspace, run } }]);
    });

    it("fails with the host's kind and reason when the host refuses", async () => {
      const reason = "git can't be started.";
      const host = new FakeHost().answer(
        "POST /v1/proposals/open",
        refused(422, "proposal_refused", reason),
      );
      const failure = await new AgentHostProposalFolders(host, workspace)
        .open(run)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AgentHostError);
      expect(failure).toMatchObject({ kind: "proposal_refused", message: reason });
    });

    it("fails on an answer without a folder", async () => {
      const host = new FakeHost().answer("POST /v1/proposals/open", ok({ folder: null }));
      await expect(new AgentHostProposalFolders(host, workspace).open(run)).rejects.toThrow(
        /without a folder/,
      );
    });
  });

  describe("folderOf", () => {
    it("gives the folder of an open run, and null for a run with none", async () => {
      const host = new FakeHost().answer("POST /v1/proposals/folder-of", (body) =>
        ok({ folder: (body as { runId: string }).runId === "run_1" ? "/data/wt/run_1" : null }),
      );
      const folders = new AgentHostProposalFolders(host, workspace);
      expect(await folders.folderOf("run_1")).toBe("/data/wt/run_1");
      expect(await folders.folderOf("run_2")).toBeNull();
    });
  });

  describe("end", () => {
    it("asks the host to end the folder", async () => {
      const host = new FakeHost().answer("POST /v1/proposals/end", ok({}));
      await new AgentHostProposalFolders(host, workspace).end("run_1");
      expect(host.calls).toEqual([
        { route: "POST /v1/proposals/end", body: { workspace, runId: "run_1" } },
      ]);
    });

    it("never throws, so the run's cancel goes on", async () => {
      const host = new FakeHost().answer(
        "POST /v1/proposals/end",
        refused(404, "unknown_workspace", "not named"),
      );
      await expect(
        new AgentHostProposalFolders(host, workspace).end("run_1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("start", () => {
    it("sends the runs that stay open", async () => {
      const host = new FakeHost().answer("POST /v1/proposals/start", ok({}));
      await new AgentHostProposalFolders(host, workspace).start(new Set(["run_2"]));
      expect(host.calls[0]?.body).toEqual({ workspace, openRuns: ["run_2"] });
    });
  });
});
