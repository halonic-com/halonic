import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts, stillOpen } from "./harness-test-kit.test-helper.ts";

verifies("engine.run-harness", () => {
  it("records the pin of the run's instruction files right before harness.started", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    ports.options = {
      ...ports.options,
      instructions: {
        pinOf: async () => ({
          files: [{ path: "AGENTS.md", sha256: "sha256:aa" }],
          sha256: "sha256:bb",
        }),
      },
    };

    const { written } = await runCallOn(ports);

    expect(written.map((event) => event.type).slice(1, 4)).toEqual([
      "sandbox.opened",
      "harness.instructions",
      "harness.started",
    ]);
    expect(written[2]).toEqual({
      type: "harness.instructions",
      state: "draft",
      agent: "writer",
      files: [{ path: "AGENTS.md", sha256: "sha256:aa" }],
      sha256: "sha256:bb",
    });
  });

  it("writes no harness.instructions when the agent has no instruction files", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    ports.options = { ...ports.options, instructions: { pinOf: async () => null } };

    const { written } = await runCallOn(ports);

    expect(written.some((event) => event.type === "harness.instructions")).toBe(false);
  });

  it("fails the step without harness.started when the instruction files can't be pinned", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    ports.options = {
      ...ports.options,
      instructions: {
        pinOf: async () => {
          throw new Error("The skill folder is missing.");
        },
      },
    };

    const { error, written } = await runCallOn(ports);

    expect(error).toEqual(new Error("The skill folder is missing."));
    expect(written.map((event) => event.type)).toEqual(["sandbox.started", "sandbox.opened"]);
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
