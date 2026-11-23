import { ProgramCopyUnavailableError } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostProgramCopies } from "./program-copies.ts";
import { AgentHostError } from "./transport.ts";

const workspace = "/work/acme";
const commit = "4f2a9c0de1b24f2a9c0de1b24f2a9c0de1b24f2a";
const copy = "/data/agent-host-program-copies/acme/4f2a9c0";

function copiesOn(host: FakeHost, reported: unknown[] = []): AgentHostProgramCopies {
  return new AgentHostProgramCopies(host, workspace, (error) => reported.push(error));
}

verifies("agent-host-client.program-copies", () => {
  describe("open", () => {
    it("sends the workspace and the commit, and gives the host's path", async () => {
      const host = new FakeHost().answer("POST /v1/program-copies/open", ok({ path: copy }));

      const lease = await copiesOn(host).open(commit);

      expect(lease.path).toBe(copy);
      expect(host.calls).toEqual([
        { route: "POST /v1/program-copies/open", body: { workspace, commit } },
      ]);
    });

    it("fails with ProgramCopyUnavailableError, the host's refusal as its cause, when the copy can't be made", async () => {
      const reason = "git can't check out this commit.";
      const host = new FakeHost().answer(
        "POST /v1/program-copies/open",
        refused(422, "program_copy_refused", reason),
      );

      const opening = copiesOn(host).open(commit);

      await expect(opening).rejects.toThrow(ProgramCopyUnavailableError);
      const error = await opening.catch((caught: unknown) => caught);
      expect((error as Error).cause).toBeInstanceOf(AgentHostError);
      expect((error as Error).cause).toMatchObject({ kind: "program_copy_refused" });
    });

    it("fails the same way for an answer without a path, never giving the workspace folder", async () => {
      const host = new FakeHost().answer("POST /v1/program-copies/open", ok({}));

      await expect(copiesOn(host).open(commit)).rejects.toThrow(ProgramCopyUnavailableError);
    });
  });

  describe("release", () => {
    it("sends the copy's path once, and gives an error to reportError instead of throwing", async () => {
      const reported: unknown[] = [];
      const host = new FakeHost()
        .answer("POST /v1/program-copies/open", ok({ path: copy }))
        .answer(
          "POST /v1/program-copies/release",
          refused(503, "host_stopping", "The agent host is stopping."),
        );
      const lease = await copiesOn(host, reported).open(commit);

      await lease.release();
      await lease.release();

      const released = host.calls.filter((call) => call.route.endsWith("/release"));
      expect(released).toEqual([
        { route: "POST /v1/program-copies/release", body: { workspace, path: copy } },
      ]);
      expect(reported).toEqual([expect.objectContaining({ kind: "host_stopping" })]);
    });
  });

  describe("start", () => {
    it("sends the workspace", async () => {
      const host = new FakeHost().answer("POST /v1/program-copies/start", ok({}));

      await copiesOn(host).start();

      expect(host.calls).toEqual([{ route: "POST /v1/program-copies/start", body: { workspace } }]);
    });
  });
});
