import type { SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn as runOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts, stillOpen } from "./harness-test-kit.test-helper.ts";

// The bridge opens before the sandbox session, so its approvals hear the
// session from the engine, before the program starts (HAL-14992).

/** The harness ports, with a bridge that notes the session it is told about, in the steps too. */
function portsHearingTheSession() {
  const ports = harnessPorts();
  const heard: SandboxSession[] = [];
  const open = ports.options.bridges.open.bind(ports.options.bridges);
  ports.options.bridges.open = async (agent, recorder, runsOn) => ({
    ...(await open(agent, recorder, runsOn)),
    sessionOpened: (session) => {
      heard.push(session);
      ports.steps.push("bridge.session" as (typeof ports.steps)[number]);
    },
  });
  ports.harness.events = [finished("ok")];
  return { ports, heard };
}

verifies("engine.harness-bridge-session", () => {
  it("tells the bridge the session it opened, after the sandbox opens and before the program starts", async () => {
    const { ports, heard } = portsHearingTheSession();

    expect((await runOn(ports)).output).toBe("ok");
    expect(heard).toHaveLength(1);
    expect(heard[0]?.profile.workingFolder).toMatch(/\/files\/agents\/writer$/);
    const order = ports.steps.filter((step) =>
      ["sandbox.open", "bridge.session", "harness.start"].includes(step),
    );
    expect(order).toEqual(["sandbox.open", "bridge.session", "harness.start"]);
  });

  it("tells it the launcher's session too, for an agent on this computer", async () => {
    const { ports, heard } = portsHearingTheSession();
    ports.placeOnThisComputer();

    await runOn(ports);

    expect(heard).toHaveLength(1);
    expect(ports.steps).toContain("this-computer.open");
  });

  it("still closes the session when the bridge's hook throws", async () => {
    const ports = harnessPorts();
    const open = ports.options.bridges.open.bind(ports.options.bridges);
    ports.options.bridges.open = async (agent, recorder, runsOn) => ({
      ...(await open(agent, recorder, runsOn)),
      sessionOpened: () => {
        throw new Error("The host couldn't take the session.");
      },
    });

    const { error } = await runOn(ports);

    expect(String(error)).toContain("The host couldn't take the session.");
    expect(ports.steps).not.toContain("harness.start");
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
