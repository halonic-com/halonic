import type { Snapshot } from "./shape.ts";
import { type MergedByAgent, openerOf } from "./summary.ts";

/**
 * Pull requests merged per agent over 7 and 30 days (HAL-17627, question 5
 * in section 4.3 of the phase 2 architecture note). The snapshot keeps only
 * a few days of closed pull requests, so each board check pass adds the
 * agents' new merges to a record in plugin state that keeps 30 days. It holds
 * `owner/name#number`, the agent its branch names and the merge time, nothing
 * else: no login, no title.
 */

/** What the record keeps between passes. */
export interface AgentMergeRecord {
  readonly version: 1;
  /** The oldest merge the first snapshot could show; earlier ones are missing. */
  readonly countingSince: string;
  /** Oldest first. */
  readonly merges: readonly AgentMerge[];
}

/** One merged pull request of an agent. */
export interface AgentMerge {
  /** `owner/name#number`. */
  readonly pull: string;
  readonly agent: string;
  readonly at: string;
}

const dayMs = 24 * 60 * 60_000;

/** How far back the record keeps merges. */
export const keepDays = 30;

/** The most merges the record keeps, newest first, so state can't grow without bound. */
const mergeCap = 10_000;

/** An agent name as branches carry it; anything else isn't counted. */
const agentPattern = /^[a-z][a-z0-9-]{0,39}$/;

const isoTime = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

function mergesOf(snapshot: Snapshot): AgentMerge[] {
  return snapshot.repos.flatMap((repo) =>
    repo.pulls.flatMap((pull) => {
      if (pull.mergedAt === null || pull.base !== repo.defaultBranch) {
        return [];
      }
      const opener = openerOf(pull, repo.repo, "");
      if (opener.kind !== "agent" || !agentPattern.test(opener.name)) {
        return [];
      }
      return [{ pull: `${repo.repo}#${pull.number}`, agent: opener.name, at: pull.mergedAt }];
    }),
  );
}

/** The record after reading `snapshot`: new agent merges added, ones older than 30 days dropped. */
export function trackAgentMerges(
  record: AgentMergeRecord | undefined,
  snapshot: Snapshot,
): AgentMergeRecord {
  const takenAt = Date.parse(snapshot.takenAt);
  const known = new Set(record?.merges.map((merge) => merge.pull));
  const added = mergesOf(snapshot).filter((merge) => !known.has(merge.pull));
  const keepFrom = takenAt - keepDays * dayMs;
  const merges = [...(record?.merges ?? []), ...added]
    .filter((merge) => Date.parse(merge.at) >= keepFrom)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-mergeCap);
  return {
    version: 1,
    countingSince:
      record?.countingSince ?? new Date(takenAt - snapshot.closedWindowDays * dayMs).toISOString(),
    merges,
  };
}

/** Each agent's merges in the 7 and 30 days before `now`, most merges first. */
export function agentMergeCounts(record: AgentMergeRecord, now: Date): MergedByAgent {
  const counts = new Map<string, { days7: number; days30: number }>();
  for (const merge of record.merges) {
    const age = now.getTime() - Date.parse(merge.at);
    if (age < 0 || age > keepDays * dayMs) {
      continue;
    }
    const count = counts.get(merge.agent) ?? { days7: 0, days30: 0 };
    counts.set(merge.agent, {
      days7: count.days7 + (age <= 7 * dayMs ? 1 : 0),
      days30: count.days30 + 1,
    });
  }
  const agents = [...counts]
    .map(([agent, count]) => ({ agent, ...count }))
    .sort((a, b) => b.days30 - a.days30 || a.agent.localeCompare(b.agent));
  return { countingSince: record.countingSince, agents };
}

function isMerge(value: unknown): value is AgentMerge {
  const merge = value as Partial<AgentMerge> | null;
  return (
    typeof merge?.pull === "string" &&
    typeof merge.agent === "string" &&
    agentPattern.test(merge.agent) &&
    typeof merge.at === "string" &&
    isoTime.test(merge.at)
  );
}

/** Reads the saved record back; undefined when nothing usable was saved. Malformed entries are skipped. */
export function readAgentMergeRecord(value: unknown): AgentMergeRecord | undefined {
  const record = value as Partial<AgentMergeRecord> | null;
  if (
    record === null ||
    typeof record !== "object" ||
    record.version !== 1 ||
    typeof record.countingSince !== "string" ||
    !isoTime.test(record.countingSince) ||
    !Array.isArray(record.merges)
  ) {
    return undefined;
  }
  return {
    version: 1,
    countingSince: record.countingSince,
    merges: record.merges.filter(isMerge),
  };
}
