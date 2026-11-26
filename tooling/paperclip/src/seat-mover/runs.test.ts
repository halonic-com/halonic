import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { databaseSeatRuns, parkedReasons } from "./runs.ts";

interface SentQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** Records what the job sends, and answers with the given rows. */
function recordingDb(rows: Record<string, unknown>[] = []) {
  const sent: SentQuery[] = [];
  return {
    sent,
    db: {
      query: async <T>(sql: string, params: unknown[] = []) => {
        sent.push({ sql, params });
        return rows as T[];
      },
    },
  };
}

/** The highest `$n` placeholder in a statement. */
const highestPlaceholder = (sql: string) =>
  Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])));

verifies("paperclip.seat-mover-job", () => {
  test("the parked-run query sends every reason as its own scalar parameter, never an array", async () => {
    // Paperclip's plugin db.query expands an array parameter into ($2, $3, $4),
    // and Postgres then can't cast that row to text[]: every pass failed (HAL-19354).
    const { db, sent } = recordingDb();
    await databaseSeatRuns(db).parked("company-1");

    const [query] = sent;
    expect(query).toBeDefined();
    expect(query?.params.some((param) => Array.isArray(param))).toBe(false);
    expect(query?.params).toEqual(["company-1", ...parkedReasons]);
    expect(highestPlaceholder(query?.sql ?? "")).toBe(query?.params.length);
    expect(query?.sql).toContain("r.scheduled_retry_reason IN ($2, $3, $4)");
    expect(query?.sql).not.toContain("::text[]");
  });

  test("the provider_quota query sends only scalar parameters", async () => {
    const { db, sent } = recordingDb();
    await databaseSeatRuns(db).quotaFailuresSince("company-1", "2026-11-26T10:00:00.000Z");

    const [query] = sent;
    expect(query?.params).toEqual(["company-1", "2026-11-26T10:00:00.000Z"]);
    expect(highestPlaceholder(query?.sql ?? "")).toBe(query?.params.length);
  });

  test("a parked row is read with its seat, and a row naming no seat has none", async () => {
    const { db } = recordingDb([
      {
        id: "run-1",
        agent_id: "agent-1",
        issue_id: "issue-1",
        connection_id: "c-1",
        retry_at: new Date("2026-11-26T10:05:00.000Z"),
      },
      { id: "run-2", agent_id: "agent-2", issue_id: null, connection_id: null, retry_at: null },
    ]);

    expect(await databaseSeatRuns(db).parked("company-1")).toEqual([
      {
        id: "run-1",
        agentId: "agent-1",
        issueId: "issue-1",
        connectionId: "c-1",
        retryAt: "2026-11-26T10:05:00.000Z",
      },
      {
        id: "run-2",
        agentId: "agent-2",
        issueId: undefined,
        connectionId: undefined,
        retryAt: undefined,
      },
    ]);
  });
});
