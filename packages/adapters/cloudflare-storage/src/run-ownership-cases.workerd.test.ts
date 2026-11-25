// Runs inside workerd: claiming who started a run, in the run list of a real D1 database. Each case
// uses scopes of its own, so it never finds the rows another case left in the database.

import { env } from "cloudflare:workers";
import { summarize } from "@halonicjs/events";
import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { D1RunList } from "./d1-run-list.ts";
import { D1RunOwnership } from "./d1-run-ownership.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

function organisation(): string {
  return `o/org_acme${crypto.randomUUID().replaceAll("-", "")}`;
}

async function publishStart(list: D1RunList, runId: string): Promise<void> {
  const summary = summarize([started(runId)]);
  if (summary === null) throw new Error("A started run has a summary.");
  await list.publish(summary, 1);
}

const byA = { startedBy: "eu_a", visibility: "private" } as const;
const byB = { startedBy: "eu_b", visibility: "organisation" } as const;

describe("D1RunOwnership", () => {
  it("writes a pending row that only runIds names until the run publishes", async () => {
    const scope = organisation();
    const ownership = new D1RunOwnership(env.DB, { scope }, () => Date.UTC(2026, 0, 1));
    const list = new D1RunList(env.DB, { scope });

    expect(await ownership.claim("r1", byA)).toEqual(byA);
    expect(await ownership.get("r1")).toEqual(byA);
    expect(await list.list()).toEqual([]);
    expect(await list.metadata()).toEqual([]);
    expect(await list.runIds()).toEqual(["r1"]);

    await publishStart(list, "r1");
    expect((await list.list()).map((run) => run.id)).toEqual(["r1"]);
    expect((await list.metadata())[0]?.startedBy).toBe("eu_a");
  });

  it("keeps the first starter through a second claim and a published summary", async () => {
    const scope = organisation();
    const ownership = new D1RunOwnership(env.DB, { scope });
    await ownership.claim("r1", byA);

    expect(await ownership.claim("r1", byB)).toEqual(byA);
    await publishStart(new D1RunList(env.DB, { scope }), "r1");
    expect(await ownership.claim("r1", byB)).toEqual(byA);
    expect(await ownership.get("r1")).toEqual(byA);
  });

  it("keeps each scope's claims to that scope", async () => {
    const scope = organisation();
    await new D1RunOwnership(env.DB, { scope }).claim("r1", byA);
    const other = new D1RunOwnership(env.DB, { scope: `${scope}b` });

    expect(await other.get("r1")).toBeNull();
    expect(await other.claim("r1", byB)).toEqual(byB);
  });

  it("reads an organisation's run from before starters were recorded as having no owner", async () => {
    const scope = organisation();
    await publishStart(new D1RunList(env.DB, { scope }), "r1");

    expect(await new D1RunOwnership(env.DB, { scope }).get("r1")).toBeNull();
  });
});
