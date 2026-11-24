import type { RunSummary } from "@halonicjs/events";
import { compareRunSummaries, matchesRunFilter, type RunFilter } from "@halonicjs/ports";
import type { SqlDatabase } from "./d1-database.ts";
import { runMigrations } from "./d1-migrations.ts";
import { migrations } from "./migrations/index.ts";

interface ListRow {
  summary: string;
}

interface MetadataRow {
  run_id: string;
  started_by: string;
  visibility: string;
  status: RunSummary["status"];
  started_at_ms: number;
}

const selectMetadata = `SELECT run_id, started_by, visibility, status, started_at_ms FROM run_list
  WHERE scope = ? ORDER BY started_at_ms DESC, run_id`;

/**
 * What the run list says about a run besides its events: who started it, who may see it, its
 * status and its start. It is all an organisation's admin may export of a run (design 13.7).
 */
export interface RunMetadata {
  readonly id: string;
  /** The id of whoever started the run; empty while nobody is named in the scope. */
  readonly startedBy: string;
  /** `private` or `organisation`. */
  readonly visibility: string;
  readonly status: RunSummary["status"];
  /** An ISO time in UTC. */
  readonly startedAt: string;
}

const upsertRun = `INSERT INTO run_list (scope, run_id, seq, hub_id, workflow_id, kind, status, started_at_ms, summary, started_by, visibility)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private')
  ON CONFLICT (scope, run_id) DO UPDATE SET
    seq = excluded.seq, hub_id = excluded.hub_id, workflow_id = excluded.workflow_id,
    kind = excluded.kind, status = excluded.status, started_at_ms = excluded.started_at_ms,
    summary = excluded.summary
  WHERE excluded.seq > run_list.seq`;

/** What a {@link D1RunList} is built with. */
export interface D1RunListOptions {
  /**
   * Names the rows this list owns: a user's `u/<id>`, an organisation's `o/<id>`, or the empty
   * scope of a deployment with no principal. Lists with different scopes share one database and
   * never see each other's runs. Every caller names it, the empty one included.
   */
  scope: string;
}

const openRunScopes = `SELECT DISTINCT scope FROM run_list
  WHERE scope != '' AND status IN ('running', 'waiting') ORDER BY scope`;

interface ScopeRow {
  scope: string;
}

/** A user's scope, `u/<id>`: its runs are that user's own, so the user started every one. */
const userScopePrefix = "u/";

/**
 * The run list in D1: what `RunStore.list` reads, filled by each run's object from its outbox.
 *
 * Every statement names the scope. Under a user's scope a run's row says the user started it and
 * that it is `private`; a row of any other scope is `private` and names nobody until whoever
 * starts the run is known there.
 *
 * {@link D1RunList.publish} is safe to repeat and to run late: it replaces a run's row only with a
 * summary of a later event, so an older update that arrives after a newer one changes nothing.
 * Filter values are only ever bound parameters, never part of the SQL.
 *
 * @example
 * const runList = new D1RunList(env.DB, { scope: "u/eu_0123456789abcdef" });
 * await runList.publish(summary, lastSeq);
 * const waiting = await runList.list({ status: "waiting" });
 */
export class D1RunList {
  readonly #db: SqlDatabase;
  readonly #scope: string;
  readonly #startedBy: string;
  #ready: Promise<void> | undefined;

  /**
   * @param db - the D1 binding from the Worker's `env`
   * @param options - the scope the list reads and writes
   */
  constructor(db: SqlDatabase, options: D1RunListOptions) {
    this.#db = db;
    this.#scope = options.scope;
    this.#startedBy = options.scope.startsWith(userScopePrefix)
      ? options.scope.slice(userScopePrefix.length)
      : "";
  }

  /**
   * Records a run's summary as of its event `seq`, unless the list already has that event or a later one.
   *
   * @param summary - the run's summary after its event `seq`
   * @param seq - the sequence number of the run's last event the summary includes
   */
  async publish(summary: RunSummary, seq: number): Promise<void> {
    await this.#migrated();
    await this.#db
      .prepare(upsertRun)
      .bind(
        this.#scope,
        summary.id,
        seq,
        summary.hubId,
        summary.workflowId,
        summary.kind,
        summary.status,
        Date.parse(summary.startedAt),
        JSON.stringify(summary),
        this.#startedBy,
      )
      .run();
  }

  /** The summaries that match the filter, newest start first, as `RunStore.list` gives them. */
  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    await this.#migrated();
    const { where, values } = narrow(this.#scope, filter);
    const { results } = await this.#db
      .prepare(`SELECT summary FROM run_list ${where}`)
      .bind(...values)
      .all<ListRow>();
    return results
      .map((row) => JSON.parse(row.summary) as RunSummary)
      .filter((summary) => matchesRunFilter(summary, filter))
      .sort(compareRunSummaries);
  }

  /** Every run of the scope as {@link RunMetadata}, newest start first, then by id. */
  async metadata(): Promise<RunMetadata[]> {
    await this.#migrated();
    const { results } = await this.#db.prepare(selectMetadata).bind(this.#scope).all<MetadataRow>();
    return results.map((row) => ({
      id: row.run_id,
      startedBy: row.started_by,
      visibility: row.visibility,
      status: row.status,
      startedAt: new Date(row.started_at_ms).toISOString(),
    }));
  }

  #migrated(): Promise<void> {
    this.#ready ??= runMigrations(this.#db, migrations).catch((error: unknown) => {
      this.#ready = undefined;
      throw error;
    });
    return this.#ready;
  }
}

/**
 * The scopes that have a running or waiting run in the run list, in order, without the empty
 * scope of a deployment with no principal. The cron's watchdog reads it to sweep each scope's
 * runs with that scope's runtime, since no single list sees them all. Like the list itself, it may
 * lag the run logs a little.
 *
 * @param db - the D1 binding from the Worker's `env`
 *
 * @example
 * for (const scope of await listOpenRunScopes(env.DB)) await sweep(scope);
 */
export async function listOpenRunScopes(db: SqlDatabase): Promise<string[]> {
  await runMigrations(db, migrations);
  const { results } = await db.prepare(openRunScopes).all<ScopeRow>();
  return results.map((row) => row.scope);
}

/**
 * Narrows the query with what SQL can match exactly. The caller still applies the port's own
 * `matchesRunFilter`, so the two can't drift apart. Only `?` marks and fixed column names are ever
 * part of the SQL text.
 */
function narrow(scope: string, filter: RunFilter): { where: string; values: (string | number)[] } {
  const clauses: string[] = ["scope = ?"];
  const values: (string | number)[] = [scope];
  const equals = (column: string, value: string | undefined) => {
    if (value !== undefined) {
      clauses.push(`${column} = ?`);
      values.push(value);
    }
  };
  equals("hub_id", filter.hubId);
  equals("workflow_id", filter.workflowId);
  equals("kind", filter.kind);
  const statuses = filter.status === undefined ? [] : [filter.status].flat();
  if (statuses.length > 0) {
    clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    values.push(...statuses);
  }
  if (filter.startedSince !== undefined) {
    clauses.push("started_at_ms >= ?");
    values.push(Date.parse(filter.startedSince));
  }
  return { where: `WHERE ${clauses.join(" AND ")}`, values };
}
