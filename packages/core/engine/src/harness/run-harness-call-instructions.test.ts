import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { runCallOn } from "./harness-call-test-kit.test-helper.ts";
import type { OpenInstructions } from "./harness-host.ts";
import { finished, harnessPorts, stillOpen } from "./harness-test-kit.test-helper.ts";

/** Instructions that note, when released, whether the session had closed by then. */
function instructionsOf(
  ports: ReturnType<typeof harnessPorts>,
  released: { afterSession: boolean[] },
): OpenInstructions {
  return {
    pin: { files: [{ path: "AGENTS.md", sha256: "sha256:aa" }], sha256: "sha256:bb" },
    folder: "<data>/instructions/instructions-1",
    release: async () => {
      released.afterSession.push(ports.steps.includes("session.close"));
    },
  };
}

verifies("engine.run-harness", () => {
  it("records the pin of the run's instruction files right before harness.started", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    ports.options = {
      ...ports.options,
      instructions: {
        open: async () => instructionsOf(ports, { afterSession: [] }),
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
    ports.options = { ...ports.options, instructions: { open: async () => null } };

    const { written } = await runCallOn(ports);

    expect(written.some((event) => event.type === "harness.instructions")).toBe(false);
  });

  it("fails the step without harness.started when the instruction files can't be pinned", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    ports.options = {
      ...ports.options,
      instructions: {
        open: async () => {
          throw new Error("The skill folder is missing.");
        },
      },
    };

    const { error, written } = await runCallOn(ports);

    expect(error).toEqual(new Error("The skill folder is missing."));
    expect(written).toEqual([]);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("gives the instructions folder to the sandbox profile and the harness", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    const released = { afterSession: [] };
    ports.options = {
      ...ports.options,
      instructions: { open: async () => instructionsOf(ports, released) },
    };
    const built = vi.spyOn(ports.options.profiles, "profileOf");

    await runCallOn(ports);

    expect(built.mock.calls[0]?.[2]).toBe("<data>/instructions/instructions-1");
    expect(ports.harness.tasks[0]?.instructionsFolder).toBe("<data>/instructions/instructions-1");
  });

  it("gives no instructions folder when the agent has no instruction files", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    ports.options = { ...ports.options, instructions: { open: async () => null } };
    const built = vi.spyOn(ports.options.profiles, "profileOf");

    await runCallOn(ports);

    expect(built.mock.calls[0]?.[2]).toBeNull();
    expect(ports.harness.tasks[0]).not.toHaveProperty("instructionsFolder");
  });

  it("releases the folder once the session has closed, when the call ends", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    const released = { afterSession: [] as boolean[] };
    ports.options = {
      ...ports.options,
      instructions: { open: async () => instructionsOf(ports, released) },
    };

    await runCallOn(ports);

    expect(released.afterSession).toEqual([true]);
  });

  it("releases the folder when the harness fails", async () => {
    const ports = harnessPorts();
    ports.harness.error = new Error("Claude Code crashed.");
    const released = { afterSession: [] as boolean[] };
    ports.options = {
      ...ports.options,
      instructions: { open: async () => instructionsOf(ports, released) },
    };

    const { error } = await runCallOn(ports);

    expect(error).toBeInstanceOf(Error);
    expect(released.afterSession).toEqual([true]);
  });

  it("releases the folder when the sandbox doesn't open", async () => {
    const ports = harnessPorts();
    const released = { afterSession: [] as boolean[] };
    ports.options = {
      ...ports.options,
      instructions: { open: async () => instructionsOf(ports, released) },
    };
    ports.options = {
      ...ports.options,
      profiles: {
        profileOf: async () => {
          throw new Error("The working folder is in a protected folder.");
        },
      },
    };

    const { error } = await runCallOn(ports);

    expect(error).toBeInstanceOf(Error);
    expect(released.afterSession).toHaveLength(1);
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
