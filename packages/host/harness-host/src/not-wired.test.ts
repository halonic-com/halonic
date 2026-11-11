import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  HarnessApprovalsNotWiredError,
  ProposalAcceptNotWiredError,
  refusingApprovals,
  refusingTrash,
} from "./not-wired.ts";

verifies("harness-host.not-wired", () => {
  it("refuses every approval with its own error, naming the tool", async () => {
    const request = refusingApprovals.request(
      { callId: "call-1", tool: "Bash", args: { command: "ls" } },
      { signal: new AbortController().signal },
    );

    const error = await request.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(HarnessApprovalsNotWiredError);
    expect(error).toMatchObject({ name: "HarnessApprovalsNotWiredError", tool: "Bash" });
    expect(String(error)).toContain("can't ask for one yet");
  });

  it("refuses to move a file to the trash with its own error", async () => {
    await expect(refusingTrash.moveToTrash("agents/writer.yaml")).rejects.toBeInstanceOf(
      ProposalAcceptNotWiredError,
    );
  });

  it("refuses to restore a file from the trash with its own error", async () => {
    await expect(refusingTrash.restore("trash-1")).rejects.toBeInstanceOf(
      ProposalAcceptNotWiredError,
    );
  });
});
