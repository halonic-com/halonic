import { StopSource } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { stillOpen } from "./harness-test-kit.test-helper.ts";
import {
  cleanAttempt,
  hedgePorts,
  runPilotOn,
  writerCallWith,
} from "./hedge-test-kit.test-helper.ts";

verifies("engine.harness-early-hedge", () => {
  describe("releases every attempt's folder, session and bridge", () => {
    it("on ship: applies the change, writes the attempt's events and gives back its result", async () => {
      const ports = hedgePorts();
      ports.harness.events = cleanAttempt("done");

      const { output, written } = await runPilotOn(ports);

      expect(output).toBe("done");
      expect(ports.folders.shipped).toEqual(["<data>/hedge/run_1/1@v1"]);
      expect(written.map(({ type }) => type)).toContain("tool.called");
      expect(ports.folders.released).toEqual(ports.folders.opened);
      expect(stillOpen(ports.steps)).toBe(0);
      expect(ports.decisions.at(-1)).toMatchObject({ kind: "ship", attempt: 1 });
    });

    it("on fallback: runs three attempts, then the fallback model in the run's own folder", async () => {
      const ports = hedgePorts();
      ports.harness.error = new Error("The writer crashed.");

      const { output } = await runPilotOn(ports);

      expect(output).toBe("from opus");
      expect(ports.folders.opened).toHaveLength(3);
      expect(ports.folders.shipped).toEqual([]);
      expect(ports.folders.released).toEqual(ports.folders.opened);
      expect(ports.bridgeAgents.map(({ filesFolder }) => filesFolder)).toEqual([
        ...ports.folders.opened,
        null,
      ]);
      expect(ports.harness.tasks.at(-1)?.model).toBe("opus");
      expect(stillOpen(ports.steps)).toBe(0);
    });

    it("on an engine stop: throws the stop's reason and runs no fallback", async () => {
      const ports = hedgePorts();
      const engine = new StopSource();
      const reason = new Error("The engine stopped.");
      ports.harness.hangs = true;
      ports.harness.whileRunning = () => engine.stop(reason);

      const { error } = await runPilotOn(ports, { stop: engine.signal });

      expect(error).toBe(reason);
      expect(ports.harness.tasks.map(({ model }) => model)).not.toContain("opus");
      expect(ports.folders.released).toEqual(ports.folders.opened);
      expect(stillOpen(ports.steps)).toBe(0);
    });

    it("on a throw: fails with the error when the change can't be applied", async () => {
      const ports = hedgePorts();
      ports.harness.events = cleanAttempt("done");
      ports.folders.shipError = new Error("The change doesn't apply.");

      const { error } = await runPilotOn(ports);

      expect(error).toBe(ports.folders.shipError);
      expect(ports.folders.released).toEqual(ports.folders.opened);
      expect(stillOpen(ports.steps)).toBe(0);
    });
  });

  it("falls back, shipping nothing, when the run's files moved since the attempts started", async () => {
    const ports = hedgePorts();
    ports.harness.events = cleanAttempt("done");
    ports.folders.versions = ["v1", "v2"];

    const { output } = await runPilotOn(ports);

    expect(output).toBe("from opus");
    expect(ports.folders.shipped).toEqual([]);
    expect(ports.decisions).toContainEqual({ kind: "files-moved", attempt: 1 });
  });

  it("runs the step once, with no attempt folder, while the pilot flag is off", async () => {
    const ports = hedgePorts(false);
    ports.harness.events = cleanAttempt("done");

    const { output } = await runPilotOn(ports);

    expect(output).toBe("done");
    expect(ports.folders.opened).toEqual([]);
    expect(ports.bridgeAgents.map(({ filesFolder }) => filesFolder)).toEqual([null]);
  });

  it("runs the step once for an agent whose file doesn't say asks: in-sandbox", async () => {
    const ports = hedgePorts();
    ports.harness.events = cleanAttempt("done");

    await runPilotOn(ports, { call: writerCallWith({ asks: "always" }) });

    expect(ports.folders.opened).toEqual([]);
  });
});
