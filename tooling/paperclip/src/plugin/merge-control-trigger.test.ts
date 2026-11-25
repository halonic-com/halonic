import { verifies } from "@halonicjs/testing-spec";
import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { companyRoster } from "./companies.ts";
import { manifest } from "./manifest.ts";
import { passTrigger } from "./merge-control-trigger.ts";
import { type ScheduledApi, scheduledPerCompany } from "./scheduled.ts";

const head = "8cc71d926".padEnd(40, "0");
const approval = {
  id: 7,
  body: "Liam: approved on head `8cc71d926`",
  author_association: "MEMBER",
  created_at: "2026-11-25T18:20:00Z",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T18:20:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * The merge-control job on a host that delivers the plugin's own events
 * back to it, and the chief line's `pr-event` route with the job's nudge.
 * Each pass takes `passMs`; `passes` counts the ones that started.
 */
function setUp(options: { prOutcomes?: boolean; passMs?: number } = {}) {
  const handlers = new Map<string, (event: PluginEvent) => Promise<void>>();
  const delivered: Promise<void>[] = [];
  const ctx = {
    companies: { list: async () => [{ id: "acme" }] },
    logger: { info: () => {}, error: () => {} },
    events: {
      on: (name: string, handler: (event: PluginEvent) => Promise<void>) => {
        handlers.set(name, handler);
      },
      emit: async (name: string, companyId: string, payload: unknown) => {
        const handler = handlers.get(`plugin.${manifest.id}.${name}`);
        delivered.push(handler?.({ companyId, payload } as PluginEvent) ?? Promise.resolve());
      },
    },
  } as unknown as ScheduledApi;
  const passes: Date[] = [];
  const job = scheduledPerCompany(ctx, companyRoster(), "merge-control", async (_, now) => {
    passes.push(now);
    await new Promise((resolve) => setTimeout(resolve, options.passMs ?? 5_000));
  });
  const nudge = passTrigger(
    (companyId) => job.request(companyId),
    (_, error) => {
      throw error;
    },
  );
  const line = fakeChiefLine({
    config: {
      chiefLine: { enabled: true, projectId: "proj-1", prOutcomes: options.prOutcomes ?? true },
    },
  });
  const event = (body: Record<string, unknown>) =>
    handleChiefLineRequest(
      lineRequest("chief-line-pr-event", { repo: "acme/tools", pr: 6089, ...body }),
      line.ctx,
      new Date(),
      nudge,
    );
  return { job, passes, event, settle: () => Promise.all(delivered) };
}

verifies("paperclip.merge-control-event-pass", () => {
  test("an approval and a green ci-ok within a second start exactly one pass", async () => {
    const { passes, event, settle } = setUp();
    expect((await event({ kind: "comment", comment: approval })).status).toBe(200);
    await vi.advanceTimersByTimeAsync(400);
    expect((await event({ kind: "ci-ok", head, conclusion: "success" })).status).toBe(200);
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(passes).toHaveLength(1);
  });

  test("with no events, passes run only on the schedule, every 2 minutes here", async () => {
    const { job, passes, settle } = setUp();
    for (let minute = 0; minute < 6; minute += 2) {
      await job.dispatch();
      await vi.advanceTimersByTimeAsync(120_000);
    }
    await settle();
    expect(passes.map((at) => at.toISOString().slice(11, 16))).toEqual(["18:20", "18:22", "18:24"]);
  });

  test("changes requested, a red ci-ok and a close start no pass", async () => {
    const { passes, event, settle } = setUp();
    await event({
      kind: "comment",
      comment: { ...approval, body: "Julian: changes requested on head `8cc71d926`" },
    });
    await event({ kind: "ci-ok", head, conclusion: "failure" });
    await event({ kind: "closed", merged: true });
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(passes).toEqual([]);
  });

  test("an event during a running pass gets one more pass after it, never two at once", async () => {
    const { job, passes, event, settle } = setUp({ passMs: 10_000 });
    await job.dispatch();
    await vi.advanceTimersByTimeAsync(2_000);
    await event({ kind: "ci-ok", head, conclusion: "success" });
    await vi.advanceTimersByTimeAsync(2_000);
    // A scheduled ask while the pass still runs is skipped, as before.
    await job.dispatch();
    expect(passes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(passes.map((at) => at.toISOString().slice(14, 19))).toEqual(["20:00", "20:10"]);
  });

  test("the pass starts also while pull request outcomes are off; the route still answers 409", async () => {
    const { passes, event, settle } = setUp({ prOutcomes: false });
    expect((await event({ kind: "ci-ok", head, conclusion: "success" })).status).toBe(409);
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(passes).toHaveLength(1);
  });
});
