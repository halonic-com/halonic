// Runs inside workerd: which scopes of the D1 run list have open runs. Every scope here ends in
// an id of its own case, so rows other cases left in the database don't change the result.

import { env } from "cloudflare:workers";
import { type RunEvent, summarize } from "@halonicjs/events";
import { completed, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { D1RunList, listOpenRunScopes } from "./d1-run-list.ts";

/** Publishes the run the events make up under `scope`. */
async function publishUnder(scope: string, events: RunEvent[]): Promise<void> {
  const summary = summarize(events);
  if (summary === null) throw new Error("A started run has a summary.");
  await new D1RunList(env.DB, { scope }).publish(summary, events.length);
}

describe("listOpenRunScopes", () => {
  it("names each scope with a running run once, in order, and no ended or empty scope", async () => {
    const id = crypto.randomUUID();
    const [personal, organisation, ended] = [`u/eu_${id}`, `o/org_${id}`, `u/eu_${id}b`];
    await publishUnder(personal, [started("r1")]);
    await publishUnder(personal, [started("r2")]);
    await publishUnder(organisation, [started("r1")]);
    await publishUnder(ended, [started("r1"), completed("r1", 2)]);
    await publishUnder("", [started(`r-${id}`)]);

    const scopes = await listOpenRunScopes(env.DB);
    expect(scopes.filter((scope) => scope.includes(id))).toEqual([organisation, personal]);
    expect(scopes).not.toContain("");
  });
});
