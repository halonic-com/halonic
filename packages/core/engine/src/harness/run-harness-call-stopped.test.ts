import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts } from "./harness-test-kit.test-helper.ts";

verifies("engine.run-harness", () => {
  it("logs a harness's harness.stopped with the state, and still gives back the agent's result", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      {
        type: "harness.stopped",
        agent: "writer",
        harness: "claude-code",
        reason: "no-exit-after-result",
        afterMs: 10_000,
      },
      finished("On its way"),
    ];

    const { output, written } = await runCallOn(ports);

    expect(output).toBe("On its way");
    expect(written.at(-1)).toEqual({
      type: "harness.stopped",
      state: "draft",
      agent: "writer",
      harness: "claude-code",
      reason: "no-exit-after-result",
      afterMs: 10_000,
    });
  });
});
