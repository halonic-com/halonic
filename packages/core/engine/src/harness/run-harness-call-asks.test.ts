import type { Agent } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn, writerCall } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts } from "./harness-test-kit.test-helper.ts";

/** Runs the writer's call with its file saying `asks`, and gives the task the harness was started with. */
async function taskWith(asks: Agent["asks"]) {
  const { asks: _written, ...agent } = writerCall.agent;
  const ports = harnessPorts();
  ports.harness.events = [finished("ok")];
  const call = { ...writerCall, agent: asks === undefined ? agent : { ...agent, asks } };
  await runCallOn(ports, undefined, undefined, undefined, call);
  return ports.harness.tasks[0];
}

verifies("engine.harness-task-asks", () => {
  it("tells the harness in-sandbox when the agent's file says so", async () => {
    expect((await taskWith("in-sandbox"))?.asks).toBe("in-sandbox");
  });

  it("says nothing about asking for asks: always, so the harness asks", async () => {
    expect(await taskWith("always")).not.toHaveProperty("asks");
  });

  it("says nothing about asking for a file without asks, so the harness asks", async () => {
    expect(await taskWith(undefined)).not.toHaveProperty("asks");
  });
});
