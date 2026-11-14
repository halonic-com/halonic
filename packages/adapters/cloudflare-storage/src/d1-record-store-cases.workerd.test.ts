// Runs inside workerd: the migration runner and the D1 record store on a real D1 database, beyond
// the RecordStore contract: migrations that run once or fail whole, and compacts that overlap
// other writers. A wrapper makes the next batch fail, or lets a case act just before it.
// Every case starts on an empty database.

import { env } from "cloudflare:workers";
import { foldRecords, type RecordChange } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import type { SqlDatabase, SqlStatement } from "./d1-database.ts";
import { runMigrations } from "./d1-migrations.ts";
import { D1RecordStore } from "./d1-record-store.ts";
import { migrations } from "./migrations/index.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

/** The database a case works on, with a way to make the next batch fail or to act before it. */
interface FaultyDatabase extends SqlDatabase {
  failNextBatch(error: Error): void;
  beforeNextBatch(hook: () => Promise<void>): void;
}

/** Drops every table the cases made, so the next case starts on an empty database. */
async function emptyDatabase(): Promise<void> {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
  ).all<{ name: string }>();
  for (const { name } of tables.results) {
    await env.DB.prepare(`DROP TABLE IF EXISTS "${name}"`).run();
  }
}

/** An empty database, as the stores see it. */
async function freshDatabase(): Promise<FaultyDatabase> {
  await emptyDatabase();
  let failure: Error | undefined;
  let hook: (() => Promise<void>) | undefined;
  return {
    prepare: (sql) => env.DB.prepare(sql),
    batch: async (statements: SqlStatement[]) => {
      if (hook !== undefined) {
        const run = hook;
        hook = undefined;
        await run();
      }
      if (failure !== undefined) {
        const error = failure;
        failure = undefined;
        throw error;
      }
      return env.DB.batch(statements as D1PreparedStatement[]);
    },
    failNextBatch: (error) => {
      failure = error;
    },
    beforeNextBatch: (run) => {
      hook = run;
    },
  };
}

const change = (
  id: string,
  op: RecordChange["op"],
  values: RecordChange["values"],
  second: number,
): RecordChange => ({
  at: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
  collection: "leads",
  id,
  op,
  values,
});

describe("the migration runner", () => {
  const first = { id: "0001-a", statements: ["CREATE TABLE a (x TEXT)"] };
  const second = { id: "0002-b", statements: ["CREATE TABLE b (x TEXT)"] };

  it("applies each migration once, however often it runs", async () => {
    const db = await freshDatabase();
    await runMigrations(db, [first]);
    await runMigrations(db, [first, second]);
    await runMigrations(db, [first, second]);

    const applied = await db.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
    expect(applied.results.map((row) => row["id"])).toEqual(["0001-a", "0002-b"]);
  });

  it("applies none of a migration whose statements fail", async () => {
    const db = await freshDatabase();
    const broken = { id: "0001-broken", statements: ["CREATE TABLE a (x TEXT)", "NOT SQL"] };

    await expect(runMigrations(db, [broken])).rejects.toThrow();
    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE name = 'a'").all();
    expect(tables.results).toEqual([]);
  });

  it("carries on when another Worker applied the migration first", async () => {
    const db = await freshDatabase();
    await runMigrations(db, []);
    await db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").bind("0001-a").run();
    db.failNextBatch(new Error("a concurrent writer won"));

    expect(await runMigrations(db, [first])).toBeUndefined();
  });

  it("refuses two migrations with one id", async () => {
    await expect(runMigrations(await freshDatabase(), [first, first])).rejects.toThrow(
      "Two migrations have the same id.",
    );
  });
});

describe("the record store", () => {
  it("migrates before its first call, and once", async () => {
    const db = await freshDatabase();
    const store = new D1RecordStore(db);

    expect(await store.changes("leads")).toEqual([]);
    await store.append([change("1", "add", { name: "Ada" }, 1)]);
    const applied = await db.prepare("SELECT id FROM schema_migrations").all();
    expect(applied.results.length).toBe(migrations.length);
  });

  it("tries the migrations again after a failed run", async () => {
    const db = await freshDatabase();
    await runMigrations(db, []);
    db.failNextBatch(new Error("D1 is unavailable"));
    const store = new D1RecordStore(db);

    await expect(store.changes("leads")).rejects.toThrow("D1 is unavailable");
    expect(await store.changes("leads")).toEqual([]);
  });

  it("appends nothing for an empty list", async () => {
    const db = await freshDatabase();
    await new D1RecordStore(db).append([]);

    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    // Not SQLite's own tables, or D1's.
    const made = tables.results.filter((row) => !/^(sqlite_|_cf_)/.test(String(row["name"])));
    expect(made).toEqual([]);
  });

  it("keeps a change appended while a compact ran after the seeds", async () => {
    const db = await freshDatabase();
    const store = new D1RecordStore(db);
    await store.append([
      change("1", "add", { name: "Ada", city: "London" }, 1),
      change("1", "update", { name: "Ada L." }, 2),
    ]);
    // The compact reads the log, then the update arrives, then the compact writes.
    db.beforeNextBatch(() => store.append([change("1", "update", { city: "Paris" }, 3)]));
    await store.compact("leads");

    const log = await store.changes("leads");
    expect(log.at(-1)?.op).toBe("update");
    expect(foldRecords(log).get("1")?.values).toEqual({ name: "Ada L.", city: "Paris" });
  });

  it("fails a compact that read the log before another compact finished", async () => {
    const db = await freshDatabase();
    const store = new D1RecordStore(db);
    await store.append([
      change("1", "add", { name: "Ada", city: "London" }, 1),
      change("1", "update", { name: "Ada L." }, 2),
    ]);
    // Compact A has read the log. Before it writes, a change arrives and compact B runs to the end.
    db.beforeNextBatch(async () => {
      await store.append([change("1", "update", { city: "Paris" }, 3)]);
      await store.compact("leads");
    });

    await expect(store.compact("leads")).rejects.toThrow();

    const log = await store.changes("leads");
    expect(foldRecords(log).get("1")?.values).toEqual({ name: "Ada L.", city: "Paris" });
    expect(log.length).toBe(1);
  });

  it("lets a compact run again after one failed", async () => {
    const db = await freshDatabase();
    const store = new D1RecordStore(db);
    await store.append([
      change("1", "add", { name: "Ada" }, 1),
      change("1", "update", { name: "Bo" }, 2),
    ]);
    db.beforeNextBatch(async () => {
      await store.compact("leads");
    });
    await expect(store.compact("leads")).rejects.toThrow();

    await store.append([change("1", "update", { name: "Cy" }, 3)]);
    await store.compact("leads");

    expect(foldRecords(await store.changes("leads")).get("1")?.values).toEqual({ name: "Cy" });
    const claims = await db.prepare("SELECT version FROM record_compactions").all();
    expect(claims.results.length).toBe(2);
  });

  it("fails a compact that read the log before two others finished", async () => {
    const db = await freshDatabase();
    const store = new D1RecordStore(db);
    await store.append([
      change("1", "add", { name: "Ada" }, 1),
      change("1", "update", { name: "Bo" }, 2),
    ]);
    // Compact A has read the log. Compacts B and C then both run to the end.
    db.beforeNextBatch(async () => {
      await store.compact("leads");
      await store.append([change("1", "update", { name: "Cy" }, 3)]);
      await store.compact("leads");
    });

    await expect(store.compact("leads")).rejects.toThrow();

    const log = await store.changes("leads");
    expect(foldRecords(log).get("1")?.values).toEqual({ name: "Cy" });
    expect(log.length).toBe(1);
  });

  it("compacts an empty collection to nothing", async () => {
    const store = new D1RecordStore(await freshDatabase());
    await store.compact("leads");

    expect(await store.changes("leads")).toEqual([]);
  });
});
