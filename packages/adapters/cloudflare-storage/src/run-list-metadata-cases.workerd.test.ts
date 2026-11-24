// Runs inside workerd: the run list's metadata against a real D1 database. Each case reads and
// writes under a scope of its own, so it never finds the rows another case left in the database.

import { env } from "cloudflare:workers";
import { summarize } from "@halonicjs/events";
import { completed, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { D1RunList } from "./d1-run-list.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

async function publish(list: D1RunList, runId: string, startSecond: number, done = false) {
  const at = new Date(Date.UTC(2026, 0, 1, 0, 0, startSecond)).toISOString();
  const events = [started(runId, { at })];
  if (done) events.push(completed(runId, 2));
  const summary = summarize(events);
  if (summary === null) throw new Error("A started run has a summary.");
  await list.publish(summary, events.length);
}

describe("D1RunList.metadata", () => {
  it("gives each run's starter, visibility, status and start, newest start first", async () => {
    const id = `acme${crypto.randomUUID().replaceAll("-", "")}`;
    const list = new D1RunList(env.DB, { scope: `u/eu_${id}` });
    await publish(list, "r-early", 5, true);
    await publish(list, "r-late", 30);
    expect(await list.metadata()).toEqual([
      {
        id: "r-late",
        startedBy: `eu_${id}`,
        visibility: "private",
        status: "running",
        startedAt: "2026-01-01T00:00:30.000Z",
      },
      {
        id: "r-early",
        startedBy: `eu_${id}`,
        visibility: "private",
        status: "completed",
        startedAt: "2026-01-01T00:00:05.000Z",
      },
    ]);
  });

  it("gives only the list's own scope, even when one scope is the start of another", async () => {
    const id = `acme${crypto.randomUUID().replaceAll("-", "")}`;
    const shorter = new D1RunList(env.DB, { scope: `o/org_${id}` });
    const longer = new D1RunList(env.DB, { scope: `o/org_${id}b` });
    await publish(shorter, "r1", 1);
    expect(await longer.metadata()).toEqual([]);
    expect((await shorter.metadata()).map((run) => run.id)).toEqual(["r1"]);
  });
});
