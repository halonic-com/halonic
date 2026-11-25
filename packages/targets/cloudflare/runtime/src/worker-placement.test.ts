import type { HarnessAgent } from "@halonicjs/engine";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { notOfferedSandbox, workerPlacement } from "./worker-placement.ts";

verifies("runtime.worker-placement", () => {
  it("places every harness agent in the sandbox", async () => {
    const agent = { runId: "run_1", hubId: "acme", agentId: "coder" } as HarnessAgent;

    expect(await workerPlacement.where(agent)).toEqual({ runsOn: "sandbox" });
  });

  it("never offers this computer: its check fails and it opens nothing", async () => {
    expect(await notOfferedSandbox.check()).toMatchObject({ ok: false, reason: "not-offered" });
    await expect(notOfferedSandbox.open({} as SandboxProfile)).rejects.toThrow(
      /only in the run's container/,
    );
  });
});
