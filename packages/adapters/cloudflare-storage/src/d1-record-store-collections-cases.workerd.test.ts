// Runs inside workerd: which collections the D1 record store names, on a real D1 database.

import { env } from "cloudflare:workers";
import type { RecordChange } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { D1RecordStore } from "./d1-record-store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

const inCollection = (collection: string, id: string): RecordChange => ({
  at: new Date(Date.UTC(2026, 0, 1, 0, 0, 1)).toISOString(),
  collection,
  id,
  op: "add",
  values: { id },
});

describe("collections", () => {
  it("names every collection that has a change, in order, once", async () => {
    const store = new D1RecordStore(env.DB);
    expect(await store.collections()).toEqual([]);

    await store.append([
      inCollection("leads", "1"),
      inCollection("agent", "1"),
      inCollection("leads", "2"),
    ]);

    expect(await store.collections()).toEqual(["agent", "leads"]);
  });
});
