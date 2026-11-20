/**
 * The Worker's run object fills the run list, inside workerd (HAL-13864). Run by `run-list.test.ts`.
 */

import { env } from "cloudflare:workers";
import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { RunObject } from "../index.ts";
import { createRuntime } from "../runtime.ts";

export { CoordinationObject, RoutinesObject } from "../index.ts";

/** The Worker's run object, with its alarm callable, so the spec needn't wait for the platform's. */
export class AlarmRunObject extends RunObject {
  async runAlarm(): Promise<void> {
    await this.alarm();
  }
}

// Test values made up for this file; the key is 32 bytes in base64url.
const configured = {
  ...(env as unknown as RuntimeEnv),
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

describe("the Worker's run object", () => {
  it("puts an appended run in the run list once its alarm has run", async () => {
    const { runStore } = await createRuntime(configured);
    const runId = `r-${crypto.randomUUID()}`;
    expect(await runStore.append(runId, 0, [started(runId)])).toMatchObject({ ok: true });

    const { RUN } = env as unknown as { RUN: DurableObjectNamespace<AlarmRunObject> };
    await RUN.get(RUN.idFromName(runId)).runAlarm();

    expect((await runStore.list()).map((run) => run.id)).toContain(runId);
  });
});
