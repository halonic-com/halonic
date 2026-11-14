// Runs inside workerd: the D1 run list against a real D1 database. Each case reads and writes
// under a scope of its own, so it never finds the rows another case left in the database.

import { env } from "cloudflare:workers";
import { type RunSummary, summarize } from "@halonicjs/events";
import { entered, started } from "@halonicjs/testing-contracts";
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

/** The summary of a run with `steps` events after its start, started `startSecond` seconds into the day. */
function summaryOf(
  runId: string,
  steps: number,
  fields: { hubId?: string; startSecond?: number } = {},
): RunSummary {
  const at = new Date(Date.UTC(2026, 0, 1, 0, 0, fields.startSecond ?? 0)).toISOString();
  const events = [started(runId, { hubId: fields.hubId ?? "hub", at })];
  for (let seq = 2; seq <= steps + 1; seq += 1) events.push(entered(runId, seq));
  const summary = summarize(events);
  if (summary === null) throw new Error("A started run has a summary.");
  return summary;
}

function ownList(): D1RunList {
  return new D1RunList(env.DB, { scope: `case-${crypto.randomUUID()}` });
}

describe("D1RunList", () => {
  it("lists what was published, newest start first, then by id", async () => {
    const list = ownList();
    await list.publish(summaryOf("b", 1, { startSecond: 10 }), 2);
    await list.publish(summaryOf("a", 1, { startSecond: 10 }), 2);
    await list.publish(summaryOf("c", 1, { startSecond: 20 }), 2);
    expect((await list.list()).map((summary) => summary.id)).toEqual(["c", "a", "b"]);
  });

  it("replaces a row only with a later event, so repeats and late updates change nothing", async () => {
    const list = ownList();
    await list.publish(summaryOf("r1", 4), 5);
    await list.publish(summaryOf("r1", 2), 3);
    await list.publish(summaryOf("r1", 4), 5);
    expect((await list.list())[0]?.statesVisited).toHaveLength(4);
    await list.publish(summaryOf("r1", 5), 6);
    expect((await list.list())[0]?.statesVisited).toHaveLength(5);
  });

  it("narrows by hub, status and start, and reads ids by case", async () => {
    const list = ownList();
    await list.publish(summaryOf("run_x", 1, { hubId: "one", startSecond: 5 }), 2);
    await list.publish(summaryOf("RUN_X", 1, { hubId: "two", startSecond: 30 }), 2);
    expect(await list.list()).toHaveLength(2);
    expect((await list.list({ hubId: "two" })).map((summary) => summary.id)).toEqual(["RUN_X"]);
    expect(await list.list({ status: ["completed", "failed"] })).toEqual([]);
    expect(await list.list({ status: [] })).toHaveLength(2);
    expect(await list.list({ status: "running" })).toHaveLength(2);
    const since = new Date(Date.UTC(2026, 0, 1, 0, 0, 10)).toISOString();
    expect((await list.list({ startedSince: since })).map((summary) => summary.id)).toEqual([
      "RUN_X",
    ]);
  });

  it("keeps each scope's runs apart in one database", async () => {
    const acme = new D1RunList(env.DB, { scope: `acme-${crypto.randomUUID()}` });
    const globex = new D1RunList(env.DB, { scope: `globex-${crypto.randomUUID()}` });
    await acme.publish(summaryOf("r1", 1), 2);
    await globex.publish(summaryOf("r1", 3), 4);
    expect((await acme.list())[0]?.statesVisited).toHaveLength(1);
    expect((await globex.list())[0]?.statesVisited).toHaveLength(3);
    expect(await ownList().list()).toEqual([]);
  });

  it("takes a hostile filter value as a value, and leaves the table alone", async () => {
    const list = ownList();
    await list.publish(summaryOf("r1", 1), 2);
    expect(await list.list({ hubId: "x' OR '1'='1" })).toEqual([]);
    expect(await list.list({ workflowId: "'; DROP TABLE run_list; --" })).toEqual([]);
    expect(await list.list()).toHaveLength(1);
  });
});
