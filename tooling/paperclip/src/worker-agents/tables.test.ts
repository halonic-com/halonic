import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { causePatterns } from "../board-check/failed-runs.ts";
import { manifest } from "../plugin/manifest.ts";
import { databaseWorkerTables } from "./tables.ts";

// Made-up company, agents and tasks only.
function recordingDb(rows: Record<string, unknown>[]) {
  const statements: { sql: string; params: unknown[] | undefined }[] = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params });
      return rows as never[];
    },
  };
  return { tables: databaseWorkerTables(db), statements };
}

async function everyStatement() {
  const { tables, statements } = recordingDb([]);
  await tables.tasksInProgress("acme");
  await tables.lastRuns("acme");
  await tables.failedRunsSince("acme", "2026-11-22T14:00:00.000Z");
  return statements;
}

/** Columns that hold text a person or a program wrote: never read, except a run's error in the cause. */
const textColumns =
  /\b(error|stdout_excerpt|stderr_excerpt|result_json|context_snapshot|log_ref|last_assistant_snippet|current_status_message|accounting_last_error|usage_json|title|description|adapter_config|runtime_config)\b/;

/** A statement without its cause expression, the one place a run's error text is matched. */
function withoutCause(sql: string): string {
  return sql.replace(/CASE WHEN[\s\S]*?END AS cause/, "");
}

verifies("paperclip.worker-agents-read", () => {
  test("reads only the core tables the manifest names, for one company, and never writes", async () => {
    const allowed = (manifest.database?.coreReadTables ?? []).map((table) => `public.${table}`);
    for (const { sql, params } of await everyStatement()) {
      expect(sql.trim()).toMatch(/^SELECT /);
      const tables = [...sql.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/gi)].map((m) => m[1]);
      expect(tables.every((table) => allowed.includes(table ?? ""))).toBe(true);
      expect(params?.[0]).toBe("acme");
      expect(sql).not.toMatch(/SELECT \*|\.\*|\b(insert|update|delete)\b/i);
    }
  });

  test("never reads an error, log, output, title or settings column", async () => {
    for (const { sql } of await everyStatement()) {
      expect(withoutCause(sql)).not.toMatch(textColumns);
    }
  });

  test("returns only a cause code for a failed run: the error is matched in the database", async () => {
    const statements = await everyStatement();
    const failed = statements[2];
    expect(failed?.sql).toMatch(/AS cause, count\(\*\)::int AS runs/);
    expect(failed?.params?.slice(2)).toEqual(causePatterns.map(([, pattern]) => pattern.source));
  });

  test("keeps only the named fields of a row, and turns an unknown cause into other", async () => {
    const { tables } = recordingDb([
      {
        agent_id: "agent-1",
        identifier: "HAL-1",
        status: "failed",
        created_at: new Date("2026-11-22T14:02:00.000Z"),
        updated_at: "2026-11-22T14:03:00.000Z",
        cause: "made_up",
        runs: 2,
        error: "a made-up secret: sk-acme-123",
      },
    ]);
    const all = [
      ...(await tables.tasksInProgress("acme")),
      ...(await tables.lastRuns("acme")),
      ...(await tables.failedRunsSince("acme", "2026-11-22T14:00:00.000Z")),
    ];
    expect(JSON.stringify(all)).not.toContain("sk-acme");
    expect(all).toEqual([
      { agentId: "agent-1", identifier: "HAL-1", updatedAt: "2026-11-22T14:03:00.000Z" },
      { agentId: "agent-1", status: "failed", at: "2026-11-22T14:02:00.000Z", task: "HAL-1" },
      { agentId: "agent-1", cause: "other", runs: 2 },
    ]);
  });
});
