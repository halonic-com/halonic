import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostRunProposals } from "./run-proposals.ts";

const workspace = "/work/acme";

verifies("agent-host-client.run-proposal-remove", () => {
  it("sends only the workspace and the run", async () => {
    const host = new FakeHost().answer("POST /v1/proposals/remove", ok({}));
    await new AgentHostRunProposals(host, workspace).remove("01JD8Q");
    expect(host.calls).toEqual([
      { route: "POST /v1/proposals/remove", body: { workspace, runId: "01JD8Q" } },
    ]);
  });

  it("fails with the host's kind when it refuses", async () => {
    const host = new FakeHost().answer(
      "POST /v1/proposals/remove",
      refused(422, "proposal_refused", "This proposal can still be opened."),
    );
    const failure = await new AgentHostRunProposals(host, workspace)
      .remove("01JD8Q")
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ kind: "proposal_refused" });
  });
});
