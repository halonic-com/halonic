// Runs inside workerd: hostile collection names, ids and values against a real D1 database. Each
// case proves two things: the text reached D1 as a bound parameter and not as part of any SQL, and
// the tables and rows are as they were.

import { env } from "cloudflare:workers";
import type { RecordChange } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import type { SqlDatabase, SqlStatement } from "./d1-database.ts";
import { D1RecordStore } from "./d1-record-store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
    }
  }
}

/** Text that would do harm if it became part of a statement. */
const payloads = [
  "x'; DROP TABLE record_changes; --",
  '"; DELETE FROM record_changes; --',
  "x' OR '1'='1",
  "x%'; UPDATE record_changes SET collection = 'pwned'; --",
  "1); DELETE FROM record_changes; --",
];

/** Names of tables the store uses, which a caller might hope to reach through a collection name. */
const tableNames = ["record_changes", "sqlite_master", "schema_migrations"];

/** The statements the store sent to D1, and every value it bound to them. */
interface Seen {
  sql: string[];
  bound: unknown[];
}

/** The real database, remembering every statement's text and every value bound to it. */
function watching(db: D1Database): { db: SqlDatabase; seen: Seen } {
  const seen: Seen = { sql: [], bound: [] };
  const real = new Map<SqlStatement, D1PreparedStatement>();
  const watch = (statement: D1PreparedStatement): SqlStatement => {
    const view: SqlStatement = {
      bind: (...values) => {
        seen.bound.push(...values);
        return watch(statement.bind(...values));
      },
      all: <Row>() => statement.all<Row>(),
      run: () => statement.run(),
    };
    real.set(view, statement);
    return view;
  };
  return {
    seen,
    db: {
      prepare: (sql) => {
        seen.sql.push(sql);
        return watch(db.prepare(sql));
      },
      batch: (statements) =>
        db.batch(statements.map((statement) => real.get(statement) as D1PreparedStatement)),
    },
  };
}

async function schema(db: D1Database): Promise<unknown[]> {
  const tables = await db.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
  return tables.results;
}

async function rowCount(db: D1Database, collection: string): Promise<number> {
  const found = await db
    .prepare("SELECT COUNT(*) AS n FROM record_changes WHERE collection = ?")
    .bind(collection)
    .first<{ n: number }>();
  return found?.n ?? 0;
}

/** A collection name no other case uses: the cases share one database, and run in any order. */
const uniqueCollection = (name: string): string => `${name}-${crypto.randomUUID()}`;

const change = (collection: string, id: string, values: Record<string, unknown>): RecordChange => ({
  at: "2026-01-01T00:00:00.000Z",
  collection,
  id,
  op: "add",
  values,
  by: { person: collection },
});

describe("hostile text in the D1 record store", () => {
  it("binds collection names, ids, values and authors, and leaves the tables untouched", async () => {
    const { db, seen } = watching(env.DB);
    const store = new D1RecordStore(db);
    const leadsName = uniqueCollection("leads");
    const leads = change(leadsName, "1", { name: "Ada" });
    await store.append([leads]);
    const schemaBefore = await schema(env.DB);

    for (const text of [...payloads, ...tableNames]) {
      const added = change(text, text, { [text]: text, note: text });
      await store.append([added]);
      expect(await store.changes(text), text).toEqual([added]);
      await store.compact(text);
      expect((await store.changes(text)).length, text).toBe(1);
    }

    // Every hostile string went to D1 as a bound value, and is no part of any statement's text.
    for (const text of [...payloads, ...tableNames]) {
      expect(seen.bound, text).toContain(text);
    }
    for (const sql of seen.sql) {
      for (const text of payloads) {
        expect(sql.includes(text), `${text} in ${sql}`).toBe(false);
      }
    }
    // The tables are as they were, and the first collection kept its row.
    expect(await schema(env.DB), "the tables").toEqual(schemaBefore);
    expect(await store.changes(leadsName), "leads").toEqual([leads]);
    expect(await rowCount(env.DB, "pwned")).toBe(0);
  });

  it("doesn't let a collection name reach another collection's rows", async () => {
    const store = new D1RecordStore(env.DB);
    const leadsName = uniqueCollection("leads");
    await store.append([
      change(leadsName, "1", { name: "Ada" }),
      change(uniqueCollection("orders"), "a", { total: 1 }),
    ]);

    for (const text of [
      "%",
      "_",
      "leads' OR collection = 'orders",
      `${leadsName.slice(0, 6)}%`,
      "*",
      "",
    ]) {
      expect(await store.changes(text), text).toEqual([]);
    }
  });
});
