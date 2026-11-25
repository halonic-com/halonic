import type { PluginStateClient } from "@paperclipai/plugin-sdk";
import type { Snapshot } from "../snapshot/shape.ts";
import { type JumpRecord, jumpTotals, updateJumps } from "./jumps.ts";
import {
  type Audience,
  type FastTrackEvent,
  fastTrackRules,
  type RuleInput,
  type Tracked,
} from "./rules.ts";

/**
 * The fast-track rules' run inside each `pr-watch` pass: it applies the
 * rules to the pass's snapshot, keeps what it reported in plugin state so
 * each event comes once, and logs the new ones, one line per task with all
 * its reasons. Phase 1 only logs (dry run), so the board supervisor can
 * compare it with the Fast-track monitor session for 2 days; it writes
 * nothing to Paperclip or GitHub.
 */

/** What the rules keep between passes, per company. */
export interface FastTrackState {
  readonly version: 1;
  /** Tracked pull requests by `owner/name#123`. */
  readonly tracked: Readonly<Record<string, Tracked>>;
  /** Event keys already reported, with when, for the tracked pull requests only. */
  readonly fired: Readonly<Record<string, string>>;
  readonly jumps: readonly JumpRecord[];
  /** The UTC day the totals were last logged, `YYYY-MM-DD`. */
  readonly totalsDay: string | null;
}

/** The state before the first pass. */
export const emptyState: FastTrackState = {
  version: 1,
  tracked: {},
  fired: {},
  jumps: [],
  totalsDay: null,
};

/** What one pass found: the new events, the log lines, and the state to save. */
export interface FastTrackPass {
  readonly events: readonly FastTrackEvent[];
  readonly lines: readonly string[];
  readonly state: FastTrackState;
}

const audienceName: Record<Audience, string> = {
  task: "the task",
  board: "the board supervisor",
  merger: "the Merger",
};

/** One line per task (or per pull request without one), with every new reason. */
function linesOf(events: readonly FastTrackEvent[]): string[] {
  const byTask = new Map<string, FastTrackEvent[]>();
  for (const event of events) {
    const task = event.task ?? `${event.repo}#${event.number}`;
    byTask.set(task, [...(byTask.get(task) ?? []), event]);
  }
  return [...byTask].map(([task, list]) => {
    const reasons = list.map(
      (event) =>
        `#${event.number} ${event.stage} (to ${event.to.map((to) => audienceName[to]).join(", ")}): ${event.text}`,
    );
    return `Fast-track (dry run) ${task}: ${reasons.join(" | ")}`;
  });
}

/** Applies the rules to a snapshot, given the last pass's state. */
export function fastTrackPass(
  snapshot: Snapshot,
  before: FastTrackState,
  settings: Pick<RuleInput, "unblocks" | "labelAdder" | "sharedScope">,
  now: Date,
): FastTrackPass {
  const fresh: FastTrackEvent[] = [];
  const tracked: Record<string, Tracked> = {};
  let jumps = [...before.jumps];
  for (const repo of snapshot.repos) {
    const prefix = `${repo.repo}#`;
    const was = new Map(
      Object.entries(before.tracked)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [Number(key.slice(prefix.length)), value] as const),
    );
    const output = fastTrackRules({ ...settings, repo, now, tracked: was });
    fresh.push(...output.events.filter((event) => before.fired[event.key] === undefined));
    for (const [number, value] of output.tracked) {
      tracked[`${prefix}${number}`] = value;
    }
    jumps = updateJumps(repo, now, jumps);
  }
  // A repository this snapshot didn't read (a failed read, a settings change)
  // keeps what it tracked, so its pull requests aren't reported as new later.
  const read = new Set(snapshot.repos.map((repo) => repo.repo));
  for (const [key, value] of Object.entries(before.tracked)) {
    if (!read.has(key.slice(0, key.lastIndexOf("#")))) {
      tracked[key] = value;
    }
  }
  // Forget the events of pull requests no longer tracked, so the store stays small.
  const fired = Object.fromEntries(
    [
      ...Object.entries(before.fired),
      ...fresh.map((event) => [event.key, now.toISOString()] as const),
    ].filter(([key]) => tracked[key.slice(0, key.indexOf(" "))] !== undefined),
  );
  const lines = linesOf(fresh);
  const day = now.toISOString().slice(0, 10);
  const totalsDue = day !== before.totalsDay && jumps.length > 0;
  if (totalsDue) {
    lines.push(jumpTotals(jumps));
  }
  return {
    events: fresh,
    lines,
    state: { version: 1, tracked, fired, jumps, totalsDay: totalsDue ? day : before.totalsDay },
  };
}

function key(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "fast-track",
    stateKey: "rules",
  } as const;
}

/** A company's saved state, or the empty one; a state of another version starts over. */
export async function loadFastTrack(
  ctx: { readonly state: Pick<PluginStateClient, "get"> },
  companyId: string,
): Promise<FastTrackState> {
  const stored = (await ctx.state.get(key(companyId))) as { version?: unknown } | null;
  return stored?.version === 1 ? (stored as FastTrackState) : emptyState;
}

/** Saves a company's state over the one before. */
export async function saveFastTrack(
  ctx: { readonly state: Pick<PluginStateClient, "set"> },
  companyId: string,
  state: FastTrackState,
): Promise<void> {
  await ctx.state.set(key(companyId), state);
}
