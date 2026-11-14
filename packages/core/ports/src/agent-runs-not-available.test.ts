import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AgentRunsNotAvailable, isAgentRunsNotAvailable } from "./index.ts";

verifies("ports.agent-runs-not-available", () => {
  it("is an Error that keeps its message", () => {
    const error = new AgentRunsNotAvailable("Not yet.");
    expect(isAgentRunsNotAvailable(error)).toBe(true);
    expect(error).toMatchObject({ name: "AgentRunsNotAvailable", message: "Not yet." });
  });

  it("accepts an error from another copy of the package", () => {
    const other = Object.assign(new Error("other"), { name: "AgentRunsNotAvailable" });
    expect(isAgentRunsNotAvailable(other)).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isAgentRunsNotAvailable(new Error("no"))).toBe(false);
    expect(isAgentRunsNotAvailable(new RangeError("no"))).toBe(false);
    expect(isAgentRunsNotAvailable("AgentRunsNotAvailable")).toBe(false);
  });
});
