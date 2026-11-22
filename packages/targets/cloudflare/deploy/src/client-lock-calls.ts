import type { CloudflareApi, DeployLease, DeployLeaseRequest } from "./api.ts";
import { DeployError } from "./errors.ts";

/** What the lock calls borrow from the client: its D1 plumbing. */
export interface LockPlumbing {
  /** Runs one SQL statement; values go in `params`, never into the SQL text. */
  query(
    accountId: string,
    databaseId: string,
    sql: string,
    params?: readonly string[],
  ): Promise<{ readonly result?: unknown }>;
  /** Runs statements as one D1 batch: all of them or none. One result per statement. */
  batch(
    accountId: string,
    databaseId: string,
    statements: readonly { sql: string; params?: readonly string[] }[],
  ): Promise<readonly { results?: unknown }[]>;
  failed(message: string): DeployError;
  databaseId(accountId: string, name: string): Promise<string | undefined>;
}

const lockTable = "_halonic_deploy_lock";
/** The database's clock in milliseconds. Second precision, which suits a ten-minute lease and works on every SQLite. */
const nowMs = "(CAST(strftime('%s','now') AS INTEGER) * 1000)";
const createLockTable = `CREATE TABLE IF NOT EXISTS ${lockTable} (slot INTEGER PRIMARY KEY CHECK (slot = 1), id TEXT NOT NULL, label TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`;
const selectLease = `SELECT id, label, started_at, expires_at FROM ${lockTable} WHERE slot = 1`;

/** The deploy lock's calls. The lock lives in the Worker's own database, so it needs no other store. */
export function lockCalls(
  plumbing: LockPlumbing,
): Pick<
  CloudflareApi,
  "takeDeployLock" | "renewDeployLock" | "releaseDeployLock" | "readDeployLock"
> {
  const { query, batch, failed } = plumbing;

  async function requireDatabase(accountId: string, name: string): Promise<string> {
    const id = await plumbing.databaseId(accountId, name);
    if (!id) throw failed(`database ${name} not found`);
    return id;
  }

  return {
    async takeDeployLock(accountId, databaseName, request: DeployLeaseRequest) {
      const id = await requireDatabase(accountId, databaseName);
      const results = await batch(accountId, id, [
        { sql: createLockTable },
        {
          // Wins only when no lease exists or the old one ran out, by the database's clock
          // (`excluded.started_at` is its "now"). The row's slot is always 1, so two deploys
          // racing for it can't both insert.
          sql: `INSERT INTO ${lockTable} (slot, id, label, started_at, expires_at) VALUES (1, ?, ?, ${nowMs}, ${nowMs} + CAST(? AS INTEGER)) ON CONFLICT(slot) DO UPDATE SET id = excluded.id, label = excluded.label, started_at = excluded.started_at, expires_at = excluded.expires_at WHERE ${lockTable}.expires_at <= excluded.started_at`,
          params: [request.id, request.label, String(request.leaseMs)],
        },
        { sql: selectLease },
      ]);
      const held = leaseFrom(results);
      if (!held) throw failed("the deploy lock could not be read back");
      return held;
    },
    async renewDeployLock(accountId, databaseName, leaseId, leaseMs) {
      const id = await requireDatabase(accountId, databaseName);
      const results = await batch(accountId, id, [
        {
          sql: `UPDATE ${lockTable} SET expires_at = ${nowMs} + CAST(? AS INTEGER) WHERE slot = 1 AND id = ?`,
          params: [String(leaseMs), leaseId],
        },
        { sql: selectLease },
      ]);
      const held = leaseFrom(results);
      return held?.id === leaseId ? held : undefined;
    },
    async releaseDeployLock(accountId, databaseName, leaseId) {
      const id = await requireDatabase(accountId, databaseName);
      await query(accountId, id, `DELETE FROM ${lockTable} WHERE slot = 1 AND id = ?`, [leaseId]);
    },
    async readDeployLock(accountId, databaseName) {
      const id = await plumbing.databaseId(accountId, databaseName);
      if (!id) return undefined;
      try {
        // A lease that ran out, by the database's clock, holds nothing.
        const body = await query(accountId, id, `${selectLease} AND expires_at > ${nowMs}`);
        return leaseFrom(Array.isArray(body.result) ? body.result : []);
      } catch (error) {
        // A database no deploy has locked yet has no table.
        if (error instanceof DeployError && /no such table/i.test(error.message)) return undefined;
        throw error;
      }
    },
  };
}

/** The lease row after a batch or query whose last statement selected it. */
function leaseFrom(results: readonly { results?: unknown }[]): DeployLease | undefined {
  const rows = results[results.length - 1]?.results;
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) return undefined;
  const { id, label, started_at: startedAt, expires_at: expiresAt } = row;
  if (typeof id !== "string" || typeof label !== "string") return undefined;
  return { id, label, startedAt: Number(startedAt), expiresAt: Number(expiresAt) };
}
