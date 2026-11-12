// Runs inside workerd: hostile text against the D1 record store on a real D1 database. Each case
// shows where the text went: into a bound parameter at the position meant for it, and into no
// statement's text. The statements themselves are a fixed list, so a new one needs this file to
// change, and the tables and other rows are as they were.

import { env } from "cloudflare:workers";
import type { RecordChange } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import type { SqlDatabase, SqlStatement } from "./d1-database.ts";
import { D1RecordStore } from "./d1-record-store.ts";
import { migrations } from "./migrations/index.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
    }
  }
}

/** Text that would do harm if it became part of a statement, or that SQL treats specially. */
const payloads = [
  "x'; DROP TABLE record_changes; --",
  '"; DELETE FROM record_changes; --',
  "x' OR '1'='1",
  "x%'; UPDATE record_changes SET collection = 'pwned'; --",
  "1); DELETE FROM record_changes; --",
  "x/* comment */; DELETE FROM record_changes; /*",
  "--",
  "?",
  "?1",
  ":a",
  "$1",
  "@a",
  '"record_changes"',
  "line one\nline two\r\nline three",
  "back\\slash\\'",
  "tab\tand\u0007bell",
  "ʼ; DROP TABLE record_changes; --",
  "＇; DROP TABLE record_changes; --",
  "x".repeat(100_000),
];

/** Names of tables the store uses, which a caller might hope to reach through a collection name. */
const tableNames = ["record_changes", "record_compactions", "sqlite_master", "schema_migrations"];

const hostile = [...payloads, ...tableNames];

/** Every statement the store (and the migration runner) may send, and no other. */
const knownStatements = new Set([
  ...migrations.flatMap((migration) => migration.statements),
  "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "SELECT id FROM schema_migrations",
  "INSERT INTO schema_migrations (id) VALUES (?)",
  `INSERT INTO record_changes (collection, id, at, op, "values", by) VALUES (?, ?, ?, ?, ?, ?)`,
  `INSERT INTO record_changes (seq, collection, id, at, op, "values", by) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  `SELECT seq, collection, id, at, op, "values", by FROM record_changes WHERE collection = ? ORDER BY seq`,
  "SELECT COALESCE(MAX(version), 0) AS version FROM record_compactions WHERE collection = ?",
  "INSERT INTO record_compactions (collection, version) VALUES (?, ?)",
  "DELETE FROM record_compactions WHERE collection = ? AND version <= ?",
  "DELETE FROM record_changes WHERE collection = ? AND seq <= ?",
]);

/** A statement the store prepared, and the values it bound to it (none, if it never bound any). */
interface Sent {
  sql: string;
  values: unknown[];
}

/**
 * The real database, remembering every statement the moment it is prepared, so one that is never
 * bound (or is built by joining text) is seen too, and the values bound to it once they are.
 */
function watching(db: D1Database): { db: SqlDatabase; sent: Sent[] } {
  const sent: Sent[] = [];
  const real = new Map<SqlStatement, D1PreparedStatement>();
  const watch = (entry: Sent, statement: D1PreparedStatement): SqlStatement => {
    const view: SqlStatement = {
      bind: (...values) => {
        entry.values = values;
        return watch(entry, statement.bind(...values));
      },
      all: <Row>() => statement.all<Row>(),
      run: () => statement.run(),
    };
    real.set(view, statement);
    return view;
  };
  return {
    sent,
    db: {
      prepare: (sql) => {
        const entry: Sent = { sql, values: [] };
        sent.push(entry);
        return watch(entry, db.prepare(sql));
      },
      batch: (statements) =>
        db.batch(statements.map((statement) => real.get(statement) as D1PreparedStatement)),
    },
  };
}

const placeholders = (sql: string): number => sql.split("?").length - 1;

/** What every case checks last: only known statements, and exactly one value per `?`. */
function expectOnlyKnownStatements(sent: Sent[]): void {
  for (const { sql, values } of sent) {
    expect(knownStatements.has(sql), `unknown statement: ${sql.slice(0, 120)}`).toBe(true);
    expect(values.length, sql).toBe(placeholders(sql));
  }
}

/** The values bound to the statements that start with `prefix`. */
const boundTo = (sent: Sent[], prefix: string): unknown[][] =>
  sent.filter(({ sql }) => sql.startsWith(prefix)).map(({ values }) => values);

const appended = (sent: Sent[]) => boundTo(sent, "INSERT INTO record_changes (collection");

/**
 * The text is in no statement, neither as it is nor as a quote-doubling escape would leave it.
 * Text the store's own statements contain, such as `?` or a table name, can't be told apart there,
 * so it is skipped here, and the exact-match check against the known statements covers it.
 */
function expectInNoStatement(sent: Sent[], text: string): void {
  for (const { sql } of sent) {
    for (const form of [text, text.replaceAll("'", "''")]) {
      if ([...knownStatements].some((known) => known.includes(form))) {
        continue;
      }
      expect(sql.includes(form), `${form.slice(0, 40)} in ${sql.slice(0, 80)}`).toBe(false);
    }
  }
}

const schema = async (db: D1Database): Promise<unknown[]> =>
  (await db.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all()).results;

const rows = async (db: D1Database): Promise<unknown[]> =>
  (await db.prepare("SELECT * FROM record_changes ORDER BY seq").all()).results;

/** A collection name no other case uses: the cases share one database, and run in any order. */
const uniqueCollection = (name: string): string => `${name}-${crypto.randomUUID()}`;

const change = (collection: string, overrides: Partial<RecordChange> = {}): RecordChange => ({
  at: "2026-01-01T00:00:00.000Z",
  collection,
  id: "1",
  op: "add",
  values: { name: "Ada" },
  ...overrides,
});

/** A store over the real database that records what it sends, with a bystander collection in it. */
async function setup() {
  const { db, sent } = watching(env.DB);
  const store = new D1RecordStore(db);
  const bystander = change(uniqueCollection("leads"));
  await store.append([bystander]);
  return { store, sent, bystander, schemaBefore: await schema(env.DB) };
}

describe("hostile text in the D1 record store", () => {
  it("binds a hostile collection name and id, where they belong", async () => {
    const { store, sent, bystander, schemaBefore } = await setup();

    for (const text of hostile) {
      const added = change(text, { id: text });
      await store.append([added]);
      expect(await store.changes(text), text.slice(0, 40)).toEqual([added]);
      await store.compact(text);
      expect((await store.changes(text)).length, text.slice(0, 40)).toBe(1);

      const [collection, id] = appended(sent).find((values) => values[0] === text) ?? [];
      expect([collection, id]).toEqual([text, text]);
      expectInNoStatement(sent, text);
    }

    expect(await schema(env.DB), "the tables").toEqual(schemaBefore);
    expect(await store.changes(bystander.collection)).toEqual([bystander]);
    expectOnlyKnownStatements(sent);
  });

  it("binds hostile values as JSON, however they are nested", async () => {
    const { store, sent, bystander, schemaBefore } = await setup();
    const collection = uniqueCollection("notes");

    for (const text of hostile) {
      const values = {
        [text]: text,
        nested: { list: [text, { deeper: text }] },
        ...(JSON.parse('{"__proto__": {"x": 1}}') as object),
        constructor: text,
        toString: text,
      };
      const added = change(collection, { id: text.slice(0, 8), values });
      await store.append([added]);

      const found = appended(sent).find((bound) => bound[4] === JSON.stringify(values));
      expect(found?.[0], text.slice(0, 40)).toBe(collection);
      expectInNoStatement(sent, text);
    }

    const log = await store.changes(collection);
    expect(log.length).toBe(hostile.length);
    for (const [index, text] of hostile.entries()) {
      expect(log[index]?.values?.["nested"], text.slice(0, 40)).toEqual({
        list: [text, { deeper: text }],
      });
      expect(Object.hasOwn(log[index]?.values ?? {}, "__proto__")).toBe(true);
    }
    expect(await schema(env.DB), "the tables").toEqual(schemaBefore);
    expect(await store.changes(bystander.collection)).toEqual([bystander]);
    expectOnlyKnownStatements(sent);
  });

  it("binds a hostile author, apart from the collection", async () => {
    const { store, sent, bystander, schemaBefore } = await setup();
    const collection = uniqueCollection("notes");

    for (const text of hostile) {
      const by = { person: text, agent: text, runId: text };
      await store.append([change(collection, { by })]);

      const found = appended(sent).find((bound) => bound[5] === JSON.stringify(by));
      expect(found?.[0], text.slice(0, 40)).toBe(collection);
      expectInNoStatement(sent, text);
    }

    const log = await store.changes(collection);
    expect(log.map((each) => each.by?.person)).toEqual(hostile);
    expect(await schema(env.DB), "the tables").toEqual(schemaBefore);
    expect(await store.changes(bystander.collection)).toEqual([bystander]);
    expectOnlyKnownStatements(sent);
  });

  it("binds a hostile time and operation, and gives them back as they were", async () => {
    const { store, sent, schemaBefore } = await setup();
    const collection = uniqueCollection("notes");

    for (const text of payloads.slice(0, 6)) {
      await store.append([change(collection, { at: text, op: text as RecordChange["op"] })]);

      const found = appended(sent).find((bound) => bound[2] === text && bound[3] === text);
      expect(found?.[0], text.slice(0, 40)).toBe(collection);
      expectInNoStatement(sent, text);
    }

    const log = await store.changes(collection);
    expect(log.map((each) => each.op)).toEqual(payloads.slice(0, 6));
    expect(await schema(env.DB), "the tables").toEqual(schemaBefore);
    expectOnlyKnownStatements(sent);
  });

  it("compacts several rows with hostile ids and values, and keeps their order", async () => {
    const { store, sent, bystander, schemaBefore } = await setup();
    const collection = uniqueCollection("notes");
    const ids = payloads.slice(0, 8);
    await store.append(ids.map((id) => change(collection, { id, values: { id, text: id } })));
    await store.append(ids.map((id) => change(collection, { id, op: "update", values: { n: 1 } })));

    await store.compact(collection);

    const log = await store.changes(collection);
    expect(log.map((each) => each.id)).toEqual(ids);
    expect(log.every((each) => each.op === "seed")).toBe(true);
    expect(log.map((each) => each.values)).toEqual(ids.map((id) => ({ id, text: id, n: 1 })));
    const seq = (await rows(env.DB)).map((row) => (row as { seq: number }).seq);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
    for (const id of ids) {
      expectInNoStatement(sent, id);
    }
    expect(await schema(env.DB), "the tables").toEqual(schemaBefore);
    expect(await store.changes(bystander.collection)).toEqual([bystander]);
    expectOnlyKnownStatements(sent);
  });

  it("doesn't let a collection name reach another collection's rows, even when compacting", async () => {
    const { store, sent, bystander } = await setup();
    const orders = change(uniqueCollection("orders"), { id: "a", values: { total: 1 } });
    await store.append([orders]);
    const before = await rows(env.DB);

    const lookalikes = [
      "%",
      "_",
      "*",
      "",
      " ",
      "leads' OR collection = 'orders",
      "x' OR collection LIKE '%",
      `${bystander.collection.slice(0, 6)}%`,
      bystander.collection.toUpperCase(),
      `${bystander.collection} `,
      ` ${bystander.collection}`,
    ];
    for (const text of lookalikes) {
      expect(await store.changes(text), JSON.stringify(text)).toEqual([]);
      await store.compact(text);
      await store.append([change(text, { id: "new" })]);
      await store.compact(text);
    }

    expect(await store.changes(bystander.collection)).toEqual([bystander]);
    expect(await store.changes(orders.collection)).toEqual([orders]);
    expect((await rows(env.DB)).length).toBe(before.length + lookalikes.length);
    expectOnlyKnownStatements(sent);
  });

  it("sends only the statements it is known to send", async () => {
    const { store, sent } = await setup();
    const collection = uniqueCollection("notes");
    await store.append([change(collection), change(collection, { op: "update" })]);
    await store.changes(collection);
    await store.compact(collection);

    const distinct = new Set(sent.map(({ sql }) => sql));
    expect(distinct.size > 4).toBe(true);
    expectOnlyKnownStatements(sent);
  });
});
