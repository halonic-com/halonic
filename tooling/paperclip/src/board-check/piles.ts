import type { BoardWrite } from "./writes.ts";

/**
 * The rest of part (a) of the board check: runs piling up in the queue for
 * one agent. Paperclip shows a task's queued and running runs through
 * `issue.subtree.read`; the board check counts the queued ones per agent
 * and reports an agent once when 5 or more wait. It keeps run ids, agent ids
 * and counts only: a run's error text never reaches it.
 */

/** Queued runs for one agent from this many on are a pile. */
export const pileSize = 5;

/** At most this many tasks' runs are read per pass; the rest wait for the next. */
export const subtreeReadLimit = 60;

/** A run as `getSubtree` shows it, limited to what a pile needs. */
export interface ActiveRun {
  readonly id: string;
  readonly agentId: string;
  readonly status: string;
}

/** An agent with a pile of queued runs. */
export interface Pile {
  readonly agentId: string;
  readonly queued: number;
}

/** What the board check keeps about piles in plugin state. */
export interface PilesRecord {
  /** When the piles were last counted, or null before the first count. */
  readonly at: string | null;
  readonly piles: readonly Pile[];
  /** Whether that count skipped tasks over `subtreeReadLimit`. */
  readonly partial: boolean;
  /** Agents already reported for their current pile. */
  readonly reported: readonly string[];
}

export const emptyPiles: PilesRecord = { at: null, piles: [], partial: false, reported: [] };

/** The agents with `pileSize` or more queued runs, largest pile first; a run seen twice counts once. */
export function queuedPiles(runs: readonly ActiveRun[]): Pile[] {
  const queued = new Map<string, Set<string>>();
  for (const run of runs) {
    if (run.status === "queued") {
      queued.set(run.agentId, (queued.get(run.agentId) ?? new Set()).add(run.id));
    }
  }
  return [...queued]
    .map(([agentId, ids]) => ({ agentId, queued: ids.size }))
    .filter((pile) => pile.queued >= pileSize)
    .sort((a, b) => b.queued - a.queued || a.agentId.localeCompare(b.agentId));
}

/** Reads the record from plugin state; anything malformed starts it afresh. */
export function readPiles(value: unknown): PilesRecord {
  const record = (value ?? {}) as Partial<PilesRecord>;
  const piles = Array.isArray(record.piles)
    ? record.piles.filter(
        (pile): pile is Pile =>
          typeof pile?.agentId === "string" && typeof pile.queued === "number",
      )
    : [];
  const reported = Array.isArray(record.reported)
    ? record.reported.filter((agentId): agentId is string => typeof agentId === "string")
    : [];
  return {
    at: typeof record.at === "string" ? record.at : null,
    piles,
    partial: record.partial === true,
    reported,
  };
}

/** The piles as one line, such as "Ravi 7, Liam 5", or undefined when there are none. */
export function pileLine(
  piles: readonly Pile[],
  names: ReadonlyMap<string, string>,
): string | undefined {
  return piles.length === 0
    ? undefined
    : piles.map((pile) => `${names.get(pile.agentId) ?? pile.agentId} ${pile.queued}`).join(", ");
}

/** What the piles part wants written this pass, and the record to save once it went through. */
export interface PilesPlan {
  readonly writes: readonly BoardWrite[];
  readonly record: PilesRecord;
  /**
   * The record to save when the line was only logged (writes off): the new
   * piles count as not reported yet, so the line goes out once writes are on.
   */
  readonly recordIfUnsent: PilesRecord;
}

/**
 * One line on the Board Checker's task when an agent has a new pile. An
 * agent whose pile is already reported isn't reported again until its
 * queue has dropped under `pileSize` and piled up anew.
 */
export function planPiles(
  previous: PilesRecord,
  count: { readonly piles: readonly Pile[]; readonly partial: boolean },
  options: {
    readonly boardCheckerTaskId: string;
    readonly names: ReadonlyMap<string, string>;
    readonly now: Date;
  },
): PilesPlan {
  const piled = count.piles.map((pile) => pile.agentId);
  const fresh = count.piles.filter((pile) => !previous.reported.includes(pile.agentId));
  const writes: BoardWrite[] = [];
  if (fresh.length > 0) {
    const partial = count.partial ? " Only some tasks were read this pass." : "";
    writes.push({
      kind: "comment",
      taskId: options.boardCheckerTaskId,
      body: `Queued runs piling up (${pileSize} or more for one agent): ${pileLine(count.piles, options.names)}.${partial}`,
    });
  }
  const record: PilesRecord = {
    at: options.now.toISOString(),
    piles: count.piles,
    partial: count.partial,
    reported: piled,
  };
  return {
    writes,
    record,
    recordIfUnsent: {
      ...record,
      reported: piled.filter((agentId) => previous.reported.includes(agentId)),
    },
  };
}
