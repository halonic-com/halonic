import type { RunSummary } from "@halonicjs/events";
import { compareRunSummaries, matchesRunFilter, type RunFilter } from "@halonicjs/ports";
import type { SqlDatabase } from "./d1-database.ts";
import { runMigrations } from "./d1-migrations.ts";
import { migrations } from "./migrations/index.ts";

interface ListRow {
  summary: string;
}

const upsertRun = `INSERT INTO run_list (scope, run_id, seq, hub_id, workflow_id, kind, status, started_at_ms, summary)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (scope, run_id) DO UPDATE SET
    seq = excluded.seq, hub_id = excluded.hub_id, workflow_id = excluded.workflow_id,
    kind = excluded.kind, status = excluded.status, started_at_ms = excluded.started_at_ms,
    summary = excluded.summary
  WHERE excluded.seq > run_list.seq`;

/** What a {@link D1RunList} can be told. */
export interface D1RunListOptions {
  /**
   * Names the rows this list owns. Lists with different scopes share one database and never see
   * each other's runs. Leave it out to use the empty scope.
   */
  scope?: string;
}

/**
 * The run list in D1: what `RunStore.list` reads, filled by each run's object from its outbox.
 *
 * {@link D1RunList.publish} is safe to repeat and to run late: it replaces a run's row only with a
 * summary of a later event, so an older update that arrives after a newer one changes nothing.
 * Filter values are only ever bound parameters, never part of the SQL.
 *
 * @example
 * const runList = new D1RunList(env.DB);
 * await runList.publish(summary, lastSeq);
 * const waiting = await runList.list({ status: "waiting" });
 */
export class D1RunList {
  readonly #db: SqlDatabase;
  readonly #scope: string;
  #ready: Promise<void> | undefined;

  /** @param db - the D1 binding from the Worker's `env` */
  constructor(db: SqlDatabase, options: D1RunListOptions = {}) {
    this.#db = db;
    this.#scope = options.scope ?? "";
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

  #migrated(): Promise<void> {
    this.#ready ??= runMigrations(this.#db, migrations).catch((error: unknown) => {
      this.#ready = undefined;
      throw error;
    });
    return this.#ready;
  }
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
