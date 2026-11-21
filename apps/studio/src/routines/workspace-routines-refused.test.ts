import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { StoredSkip } from "./routine-reads.ts";
import { setup, weekly, weeklyRun } from "./workspace-routines.test-helper.ts";

const sentence = 'Writer uses the connector "notes", which Studio can\'t start yet.';
const fix = "To keep it starting on time, run this in a terminal: halonic routines watch";

const refused = (at: string): StoredSkip => ({
  reason: "start-refused",
  sentence,
  fix,
  from: at,
  to: at,
  count: 1,
});

const ranAt = (startedAt: string): Partial<RunSummary> => ({
  ...weeklyRun,
  id: startedAt,
  status: "completed",
  startedAt,
});

/** The `refusedAt` of `weekly-report`'s listing, with `skips` and `runs`. */
async function refusedAtOf(skips: StoredSkip[], runs: Partial<RunSummary>[]) {
  const { host } = setup({ skips: async () => skips }, runs);
  const listings = await host.list();
  return listings.find((listing) => listing.id === weekly.id)?.refusedAt;
}

verifies("studio.workspace-routines-refused", () => {
  it("gives the time of a newest due time whose start was refused, until a run or another skip comes", async () => {
    const at = "2026-11-21T19:41:00.000Z";
    expect(await refusedAtOf([refused(at)], [ranAt("2026-11-21T19:40:00.000Z")])).toBe(at);
    expect(await refusedAtOf([refused(at)], [ranAt("2026-11-21T19:42:00.000Z")])).toBeUndefined();
    const busy: StoredSkip = { reason: "busy", from: at, to: at, count: 1 };
    expect(await refusedAtOf([busy, refused(at)], [])).toBeUndefined();
    expect(await refusedAtOf([], [])).toBeUndefined();
  });

  it("lists a routine whose skips can't be read as not refused", async () => {
    const { host } = setup({
      skips: async () => Promise.reject(new Error("skip store unreadable")),
    });
    const listing = (await host.list()).find((each) => each.id === weekly.id);
    expect(listing?.refusedAt).toBeUndefined();
  });

  it("gives a refused start's next step with its skip", async () => {
    const { host } = setup({ skips: async () => [refused("2026-11-21T19:41:00.000Z")] });
    const { skips } = await host.runs(weekly);
    expect(skips).toEqual([
      {
        reason: "start-refused",
        sentence,
        fix,
        from: "2026-11-21T19:41:00.000Z",
        to: "2026-11-21T19:41:00.000Z",
        count: 1,
      },
    ]);
  });

  it("tells its listeners when the engine adds to a routine's skips, and stops when asked", async () => {
    const skipListeners = new Set<() => void>();
    const { host } = setup({
      onSkips: (listener) => {
        skipListeners.add(listener);
        return () => skipListeners.delete(listener);
      },
    });
    let told = 0;
    const stop = host.subscribe(() => {
      told += 1;
    });
    for (const listener of skipListeners) listener();
    expect(told).toBe(1);
    stop();
    expect(skipListeners.size).toBe(0);
  });
});
