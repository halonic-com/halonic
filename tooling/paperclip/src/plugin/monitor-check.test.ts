import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { saveSnapshot } from "../snapshot/store.ts";
import { head, openPull, snapshot } from "../state-packet/fakes.test-helper.ts";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";
import { keepMonitorCheck, monitorChecks } from "./monitor-check.ts";
import type { StatePacketApi } from "./state-packet-data.ts";

const companyId = "company-1";
const request = { companyId, issueId: "task-41", wakeReason: "issue_monitor_due" };

/** A plugin context with HAL-41 and a snapshot taken just now, so GitHub is never reached. */
async function fakeContext(config: Record<string, unknown>) {
  const { state } = fakeState();
  const { metrics } = fakeMetrics();
  const logged: string[] = [];
  const ctx = {
    state,
    metrics,
    config: { get: async () => config },
    secrets: { resolve: () => Promise.reject(new Error("no secrets in this test")) },
    http: { fetch: () => Promise.reject(new Error("no GitHub in this test")) },
    issues: {
      get: async (issueId: string) => (issueId === "task-41" ? { identifier: "HAL-41" } : null),
    },
    logger: { info: (line: string) => logged.push(line) },
  } as unknown as StatePacketApi;
  await saveSnapshot(
    ctx,
    companyId,
    snapshot([openPull(41, "ada/HAL-41-fuel")], new Date().toISOString()),
  );
  return { ctx, logged };
}

verifies("paperclip.monitor-dedupe", () => {
  test("a monitor wake keeps its task's open pull request heads and ci-ok, on by default", async () => {
    const { ctx } = await fakeContext({});
    const kept = await keepMonitorCheck(ctx, request);
    expect(kept?.marks).toEqual([`acme/rockets#41@${head} success`]);
    expect(await monitorChecks(ctx, companyId).get("HAL-41")).toEqual(kept);
    const declared = manifest.instanceConfigSchema?.["properties"] as Record<
      string,
      { default?: unknown }
    >;
    expect(declared["monitorDedupe"]?.default).toBe("on");
  });

  test("keeps nothing with the setting off, for another wake or an unknown task", async () => {
    const off = await fakeContext({ monitorDedupe: "off" });
    expect(await keepMonitorCheck(off.ctx, request)).toBeUndefined();
    expect(await monitorChecks(off.ctx, companyId).get("HAL-41")).toBeUndefined();
    const { ctx } = await fakeContext({});
    expect(
      await keepMonitorCheck(ctx, { ...request, wakeReason: "issue_assigned" }),
    ).toBeUndefined();
    expect(await keepMonitorCheck(ctx, { ...request, issueId: "task-99" })).toBeUndefined();
    expect(await monitorChecks(ctx, companyId).get("HAL-41")).toBeUndefined();
  });

  test("a failed read is logged and keeps nothing, without throwing", async () => {
    const { ctx, logged } = await fakeContext({});
    const broken = {
      ...ctx,
      issues: { get: () => Promise.reject(new Error("Paperclip is down")) },
    } as unknown as StatePacketApi;
    expect(await keepMonitorCheck(broken, request)).toBeUndefined();
    expect(logged).toEqual([
      "Monitor dedupe: couldn't keep the check of task-41: Paperclip is down",
    ]);
  });
});
