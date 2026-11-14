import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AgentRunsNotSupported, isAgentRunsNotSupported, RunTargetNotFound } from "./index.ts";

verifies("ports.agent-runs-not-supported", () => {
  it("is an error that keeps its message and passes the check", () => {
    const error = new AgentRunsNotSupported("No agent loop yet.");
    expect(isAgentRunsNotSupported(error)).toBe(true);
    expect(error).toMatchObject({ name: "AgentRunsNotSupported", message: "No agent loop yet." });
  });

  it("accepts an error from another copy of the package", () => {
    const copy = Object.assign(new Error("other copy"), { name: "AgentRunsNotSupported" });
    expect(isAgentRunsNotSupported(copy)).toBe(true);
  });

  it("refuses a plain error, another port error and a non-error", () => {
    expect(isAgentRunsNotSupported(new Error("boom"))).toBe(false);
    expect(isAgentRunsNotSupported(new RunTargetNotFound("agent", "a", "No."))).toBe(false);
    expect(isAgentRunsNotSupported({ name: "AgentRunsNotSupported" })).toBe(false);
  });
});
