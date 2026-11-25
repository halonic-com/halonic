/**
 * The run object's bridge and the run container object, inside workerd. Run by `run-bridge.test.ts`.
 */

import { env } from "cloudflare:workers";
import { harnessBridgeTokenHeader } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import type { RunObject } from "../index.ts";
import type { RunContainerObject } from "../run-container-object.ts";

export {
  CoordinationObject,
  RoutinesObject,
  RunContainerObject,
  RunObject,
} from "../index.ts";

const bindings = env as unknown as {
  RUN: DurableObjectNamespace<RunObject>;
  RUN_CONTAINER: DurableObjectNamespace<RunContainerObject>;
};

describe("the run object's bridge", () => {
  it("answers 401 for its run while no harness step has its bridge open", async () => {
    const { RUN } = bindings;
    const runObject = RUN.get(RUN.idFromName(`r-${crypto.randomUUID()}`));

    const answer = await runObject.bridge(
      new Request("http://bridge.halonic.invalid/v1/messages", {
        method: "POST",
        headers: { [harnessBridgeTokenHeader]: "made-up-credential" },
      }),
    );

    expect(answer.status).toBe(401);
    // Nothing to revoke yet, which is fine: the container's alarm may come after the run's end.
    await runObject.revokeBridge();
  });
});

describe("the run container object", () => {
  it("is unavailable, and starts nothing, where the configuration gives it no container", async () => {
    const { RUN_CONTAINER } = bindings;
    const name = `r-${crypto.randomUUID()}`;
    const container = RUN_CONTAINER.get(RUN_CONTAINER.idFromName(name));

    expect(await container.available()).toBe(false);
    await expect(
      container.begin({
        runId: name,
        deadlineMs: Date.now() + 60_000,
        env: {},
        bridgeHost: "bridge.halonic.invalid",
        allowedSites: [],
      }),
    ).rejects.toThrow(/no run container/);
  });
});
