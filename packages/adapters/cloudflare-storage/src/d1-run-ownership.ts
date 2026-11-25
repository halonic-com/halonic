import type { SqlDatabase } from "./d1-database.ts";
import { runMigrations } from "./d1-migrations.ts";
import type { RunVisibility } from "./d1-run-list.ts";
import { migrations } from "./migrations/index.ts";

/** Who started a run and who may see it, as the run list stores it. */
export interface StoredRunOwnership {
  /** The id of whoever started the run. */
  readonly startedBy: string;
  readonly visibility: RunVisibility;
}

interface OwnershipRow {
  started_by: string;
  visibility: RunVisibility;
}

/**
 * The run list's row of a run that is claimed but hasn't published an event yet. Its `seq` is
 * below any event's, so the run's first summary replaces it, and `publish` never touches who
 * started the run or who may see it.
 */
const insertPending = `INSERT INTO run_list (scope, run_id, seq, hub_id, workflow_id, kind, status, started_at_ms, summary, started_by, visibility)
  VALUES (?, ?, -1, '', '', '', 'pending', ?, '', ?, ?)
  ON CONFLICT (scope, run_id) DO NOTHING`;

const selectOwnership = `SELECT started_by, visibility FROM run_list WHERE scope = ? AND run_id = ?`;

/** What a {@link D1RunOwnership} is built with. */
export interface D1RunOwnershipOptions {
  /** The scope whose runs it records, the same name the scope's `D1RunList` is built with. */
  scope: string;
}

/**
 * Who started each run of one scope, kept in the scope's run list. Claiming a run id writes its
 * row, as `pending`, before anything calls the run's object, so the run list names every run
 * object a scope has, and deleting the scope finds each of them. The row's starter is written
 * only by that first claim: no statement here updates it.
 *
 * A claim stays when the start after it fails. The start may have reached the run's object
 * before it failed, and the row is how a scope's deletion finds that object.
 *
 * @example
 * const ownership = new D1RunOwnership(env.DB, { scope: "o/org_acme" });
 * const owner = await ownership.claim("run_1", { startedBy: "eu_a", visibility: "private" });
 */
export class D1RunOwnership {
  readonly #db: SqlDatabase;
  readonly #scope: string;
  readonly #now: () => number;
  #ready: Promise<void> | undefined;

  /**
   * @param db - the D1 binding from the Worker's `env`
   * @param options - the scope whose runs it records
   * @param now - the time a claim records as the run's start until its first event; a test passes its own
   */
  constructor(db: SqlDatabase, options: D1RunOwnershipOptions, now: () => number = Date.now) {
    this.#db = db;
    this.#scope = options.scope;
    this.#now = now;
  }

  /**
   * Records `owner` for the run unless the scope already has a row for it. The insert either
   * writes the row or does nothing, in one statement, so two claims of one id can't both win.
   *
   * @returns the owner now stored: `owner` when this call recorded it, the earlier one otherwise
   */
  async claim(runId: string, owner: StoredRunOwnership): Promise<StoredRunOwnership> {
    await this.#migrated();
    await this.#db
      .prepare(insertPending)
      .bind(this.#scope, runId, this.#now(), owner.startedBy, owner.visibility)
      .run();
    const stored = await this.#read(runId);
    if (stored === null) {
      throw new Error(`The run list has no row for ${runId} right after claiming it.`);
    }
    return stored;
  }

  /**
   * The run's owner, or `null` when the scope has no row for it or its row names nobody, as an
   * organisation's run from before starters were recorded does.
   */
  async get(runId: string): Promise<StoredRunOwnership | null> {
    await this.#migrated();
    const stored = await this.#read(runId);
    return stored === null || stored.startedBy === "" ? null : stored;
  }

  async #read(runId: string): Promise<StoredRunOwnership | null> {
    const { results } = await this.#db
      .prepare(selectOwnership)
      .bind(this.#scope, runId)
      .all<OwnershipRow>();
    const row = results[0];
    return row === undefined ? null : { startedBy: row.started_by, visibility: row.visibility };
  }

  #migrated(): Promise<void> {
    this.#ready ??= runMigrations(this.#db, migrations).catch((error: unknown) => {
      this.#ready = undefined;
      throw error;
    });
    return this.#ready;
  }
}
