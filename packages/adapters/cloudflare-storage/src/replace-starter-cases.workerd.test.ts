// Runs inside workerd: replacing a deleted person's id as the starter of the organisations' runs.
// Each case uses ids of its own, so it never finds the rows another case left in the database.

import { env } from "cloudflare:workers";
import { summarize } from "@halonicjs/events";
import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { D1RunList, formerMemberId, replaceStarter } from "./d1-run-list.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

function tail(): string {
  return `acme${crypto.randomUUID().replaceAll("-", "")}`;
}

/** Publishes run `r1` under the scope and names `startedBy` as its starter, as S1-5 will. */
async function runStartedBy(scope: string, startedBy: string): Promise<D1RunList> {
  const list = new D1RunList(env.DB, { scope });
  const summary = summarize([started("r1")]);
  if (summary === null) throw new Error("A started run has a summary.");
  await list.publish(summary, 1);
  await env.DB.prepare("UPDATE run_list SET started_by = ? WHERE scope = ?")
    .bind(startedBy, scope)
    .run();
  return list;
}

async function starterOf(list: D1RunList): Promise<string | undefined> {
  return (await list.metadata())[0]?.startedBy;
}

describe("replaceStarter", () => {
  it("names the former member instead of the person in every organisation, and nowhere else", async () => {
    const person = `eu_${tail()}`;
    const other = `eu_${tail()}`;
    const first = await runStartedBy(`o/org_${tail()}`, person);
    const second = await runStartedBy(`o/org_${tail()}`, person);
    const othersRun = await runStartedBy(`o/org_${tail()}`, other);
    // The person's own scope keeps naming them: deleting that scope erases it instead.
    const own = await runStartedBy(`u/${person}`, person);

    expect(await replaceStarter(env.DB, person)).toBe(2);
    expect(await starterOf(first)).toBe(formerMemberId);
    expect(await starterOf(second)).toBe(formerMemberId);
    expect(await starterOf(othersRun)).toBe(other);
    expect(await starterOf(own)).toBe(person);
  });

  it("changes nothing when run again, and takes a hostile id as a value", async () => {
    const person = `eu_${tail()}`;
    const list = await runStartedBy(`o/org_${tail()}`, person);
    await replaceStarter(env.DB, person);
    expect(await replaceStarter(env.DB, person)).toBe(0);
    expect(await replaceStarter(env.DB, "x' OR '1'='1")).toBe(0);
    expect(await replaceStarter(env.DB, "%")).toBe(0);
    expect(await starterOf(list)).toBe(formerMemberId);
  });
});
