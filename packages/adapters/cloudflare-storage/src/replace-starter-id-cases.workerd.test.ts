// Runs inside workerd: `replaceStarter` with an id that isn't an end user's changes nothing.

import { env } from "cloudflare:workers";
import { summarize } from "@halonicjs/events";
import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { D1RunList, replaceStarter } from "./d1-run-list.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

describe("replaceStarter with an id that isn't an end user's", () => {
  it("leaves an organisation's run that names nobody as it is", async () => {
    const list = new D1RunList(env.DB, {
      scope: `o/org_acme${crypto.randomUUID().replaceAll("-", "")}`,
    });
    const summary = summarize([started("r1")]);
    if (summary === null) throw new Error("A started run has a summary.");
    await list.publish(summary, 1);

    for (const id of ["", "eu_", "eu_a-b"]) {
      expect(await replaceStarter(env.DB, id)).toBe(0);
    }
    expect((await list.metadata())[0]?.startedBy).toBe("");
  });
});
