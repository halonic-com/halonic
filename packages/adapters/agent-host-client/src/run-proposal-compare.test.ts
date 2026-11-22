import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostRunProposals } from "./run-proposals.ts";

const workspace = "/work/acme";
const seen = `sha256:${"a".repeat(64)}`;
const texts = { base: "a\n", saved: "a\nmine\n", run: "a\nrun\n", combined: null, seen };
const written = { undo: "u1", written: ["notes.md"], changedOnDisk: [], refused: [] };

verifies("agent-host-client.run-proposal-compare", () => {
  it("compares with only the workspace, the run and the path", async () => {
    const host = new FakeHost().answer("POST /v1/proposals/compare", ok(texts));
    const compared = await new AgentHostRunProposals(host, workspace).compare("01JD8Q", "notes.md");
    expect(compared).toEqual(texts);
    expect(host.calls).toEqual([
      {
        route: "POST /v1/proposals/compare",
        body: { workspace, runId: "01JD8Q", path: "notes.md" },
      },
    ]);
  });

  it("keeps why the host would refuse the file", async () => {
    const answer = { ...texts, saved: null, refused: "under-git" };
    const host = new FakeHost().answer("POST /v1/proposals/compare", ok(answer));
    const compared = await new AgentHostRunProposals(host, workspace).compare("01JD8Q", "notes.md");
    expect(compared).toMatchObject({ saved: null, refused: "under-git" });
  });

  it("chooses with the choice and what Compare showed, never a text", async () => {
    const host = new FakeHost().answer("POST /v1/proposals/choose", ok(written));
    const proposals = new AgentHostRunProposals(host, workspace);
    expect(await proposals.choose("01JD8Q", "notes.md", "use-run", seen)).toEqual(written);
    expect(host.calls).toEqual([
      {
        route: "POST /v1/proposals/choose",
        body: { workspace, runId: "01JD8Q", path: "notes.md", choice: "use-run", seen },
      },
    ]);
  });

  it("fails with the host's kind when the texts can't be combined", async () => {
    const host = new FakeHost().answer(
      "POST /v1/proposals/choose",
      refused(409, "cannot_combine", "Both change the same lines."),
    );
    const failure = await new AgentHostRunProposals(host, workspace)
      .choose("01JD8Q", "notes.md", "combine-both", seen)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ kind: "cannot_combine" });
  });
});
