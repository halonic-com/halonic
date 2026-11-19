import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn as runOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts } from "./harness-test-kit.test-helper.ts";

// The bridge opens where the call's sandbox can reach it (HAL-13090): the
// launcher's unfenced program has no proxy to a Unix socket.

verifies("engine.harness-bridge-placement", () => {
  it("tells the host the bridge is for a sandbox when the agent runs in one", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];

    const { output } = await runOn(ports);

    expect(output).toBe("ok");
    expect(ports.bridgePlacements).toEqual(["sandbox"]);
  });

  it("tells the host the bridge is for this computer when a person chose that", async () => {
    const ports = harnessPorts();
    ports.placeOnThisComputer();
    ports.harness.events = [finished("ok")];

    const { output } = await runOn(ports);

    expect(output).toBe("ok");
    expect(ports.bridgePlacements).toEqual(["this-computer"]);
    expect(ports.steps).toContain("this-computer.open");
  });
});
