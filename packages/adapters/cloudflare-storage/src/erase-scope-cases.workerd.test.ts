// Runs inside workerd: erasing a scope's blobs, records and run list rows. Each case uses scopes of
// its own, so it never finds what another case left in the bucket or the database.

import { env } from "cloudflare:workers";
import { summarize } from "@halonicjs/events";
import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { D1RecordStore } from "./d1-record-store.ts";
import { D1RunList } from "./d1-run-list.ts";
import { R2BlobStore } from "./r2-blob-store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
      /** The test Worker's R2 bucket, bound by the test file that starts workerd. */
      BLOBS: R2Bucket;
    }
  }
}

/** The bucket, listing one object per page, so erasing three blobs takes three rounds. */
const onePerPage: ConstructorParameters<typeof R2BlobStore>[0] = {
  head: (key) => env.BLOBS.head(key),
  get: (key) => env.BLOBS.get(key),
  put: (key, value, options) => env.BLOBS.put(key, value, options),
  list: (options) => env.BLOBS.list({ ...options, limit: 1 }),
  delete: (keys) => env.BLOBS.delete(keys),
};

/** Two scopes, one the start of the other, as `u/eu_acme…` and `u/eu_acme…b`. */
function scopePair(): [string, string] {
  const id = `u/eu_acme${crypto.randomUUID().replaceAll("-", "")}`;
  return [id, `${id}b`];
}

const lead = {
  at: "2026-01-01T00:00:00.000Z",
  collection: "leads",
  id: "1",
  op: "add" as const,
  values: { name: "Ada" },
};

describe("erasing a scope", () => {
  it("deletes every object under the blob store's prefix, across pages, and nothing else", async () => {
    const [erased, kept] = scopePair();
    const store = new R2BlobStore(onePerPage, `${erased}/`);
    const other = new R2BlobStore(onePerPage, `${kept}/`);
    for (const text of ["one", "two"])
      await store.put(new TextEncoder().encode(text), "text/plain");
    await env.BLOBS.put(`${erased}/readme.txt`, "not a blob");
    const keptRef = await other.put(new TextEncoder().encode("one"), "text/plain");

    await store.eraseAll();
    await store.eraseAll();
    expect((await env.BLOBS.list({ prefix: `${erased}/` })).objects).toEqual([]);
    expect(await other.hashes()).toEqual([keptRef.hash]);
  });

  it("refuses a blob store whose prefix is empty or only /, and deletes nothing", async () => {
    for (const prefix of ["", "/", "//"]) {
      await expect(new R2BlobStore(onePerPage, prefix).eraseAll()).rejects.toThrow(RangeError);
    }
  });

  it("deletes the scope's records, claims and run rows, and leaves a scope it starts", async () => {
    const [erased, kept] = scopePair();
    const summary = summarize([started("r1")]);
    if (summary === null) throw new Error("A started run has a summary.");
    for (const scope of [erased, kept]) {
      const records = new D1RecordStore(env.DB, { scope });
      await records.append([lead]);
      await records.compact("leads");
      await new D1RunList(env.DB, { scope }).publish(summary, 1);
    }

    const records = new D1RecordStore(env.DB, { scope: erased });
    const runs = new D1RunList(env.DB, { scope: erased });
    await records.eraseScope();
    await runs.eraseScope();
    await records.eraseScope();
    expect(await records.collections()).toEqual([]);
    expect(await runs.list()).toEqual([]);
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS claims FROM record_compactions_scoped WHERE scope = ?",
    )
      .bind(erased)
      .all<{ claims: number }>();
    expect(results[0]?.claims).toBe(0);

    // The kept scope's change was compacted into a seed of the same record.
    const keptChanges = await new D1RecordStore(env.DB, { scope: kept }).changes("leads");
    expect(keptChanges.map(({ id, values }) => ({ id, values }))).toEqual([
      { id: lead.id, values: lead.values },
    ]);
    expect(await new D1RunList(env.DB, { scope: kept }).list()).toHaveLength(1);
  });
});
