import { moveAgent, releaseRun, runsToRelease } from "./act.ts";
import type { SeatApi } from "./api.ts";
import {
  type AgentPlace,
  arrivedSinceReading,
  type Seat,
  seatedOn,
  targetRefusal,
} from "./checklist.ts";
import { planMoves, type SeatPlan } from "./plan.ts";
import { buildSeats, parseConnections, parseSeatReadings } from "./readings.ts";
import { batchComment, moveLine, stuckNote } from "./report.ts";
import type { SeatResets } from "./reset.ts";
import type { ParkedRun, SeatRuns } from "./runs.ts";
import type { SeatMoverSettings } from "./settings.ts";

/**
 * One pass of the seat mover for one company (HAL-19354): read the seats,
 * where every agent sits and which runs are parked, plan the batch, and in
 * `act` mode move the agents and release what stays parked on seats they
 * left. Every move and its reason goes to the plugin log; each batch is one
 * comment on the log task; an agent with no legal seat is told to the board
 * once. In `shadow` mode the same plan is logged and commented (only when it
 * changes), and nothing moves.
 */

/** An agent as the plugin SDK lists it, with the fields the pass reads. */
export interface AgentRow {
  readonly id: string;
  readonly name: string;
  readonly urlKey?: string | null;
  readonly status: string;
  readonly runtimeConfig?: Record<string, unknown> | null;
}

/** What the pass keeps between passes. */
export interface SeatMoverMemory {
  /** The last shadow batch commented, so an unchanged plan isn't commented again. */
  readonly lastShadow?: string;
  /** `agentId|seat` of each agent the board was told has no legal seat. */
  readonly stuckNoted?: readonly string[];
  /** Agent id → when the mover last moved it, for the cooldown; older entries are dropped. */
  readonly movedAt?: Readonly<Record<string, string>>;
  /** Agent id → the seat the mover last moved it to, kept as long as its `movedAt` (HAL-19695). */
  readonly movedTo?: Readonly<Record<string, string>>;
}

/** Where the mover last moved an agent, and when. */
export interface RecentMove {
  readonly connectionId: string;
  readonly at: string;
}

export interface SeatMoverDeps {
  readonly companyId: string;
  readonly now: Date;
  readonly settings: SeatMoverSettings;
  readonly api: SeatApi;
  readonly runs: SeatRuns;
  readonly agents: () => Promise<readonly AgentRow[]>;
  /** The seats the board reset by hand lately (HAL-19490): older readings of them don't count. */
  readonly resets: () => Promise<SeatResets>;
  readonly issueStatus: (issueId: string) => Promise<string | undefined>;
  /** Wakes a task's assignee the way the line threads do, so the run stays on the agent's own seat. */
  readonly wake: (issueId: string, idempotencyKey: string) => Promise<void>;
  readonly comment: (task: string, body: string) => Promise<void>;
  readonly memory: {
    get(): Promise<SeatMoverMemory>;
    set(memory: SeatMoverMemory): Promise<void>;
  };
  readonly log: (line: string, meta?: Record<string, unknown>) => void;
  readonly logError: (line: string, meta?: Record<string, unknown>) => void;
}

/** How far back a `provider_quota` failure counts as a "seat full" signal. */
const quotaLookbackMs = 60 * 60_000;
/** At most this many parked runs released in one pass. */
const releasesPerPass = 10;

function connectionOf(agent: AgentRow): string | undefined {
  const connection = agent.runtimeConfig?.["aiConnection"] as Record<string, unknown> | undefined;
  const id = connection?.["connectionId"];
  // Only a seat the agent is pinned to; a router or no connection is left alone.
  return connection?.["mode"] === "delegated" && typeof id === "string" ? id : undefined;
}

/**
 * The parked runs still waiting. A run already due (released by a seat reset,
 * HAL-19490) is about to start, so it doesn't count.
 */
function stillWaiting(parked: readonly ParkedRun[], now: Date): ParkedRun[] {
  return parked.filter(
    (run) => run.retryAt === undefined || Date.parse(run.retryAt) > now.getTime(),
  );
}

/** The seats runs are parked waiting for: each counts as full (the board's audit rule 2). */
export function seatsWaitedOn(parked: readonly ParkedRun[], now: Date): Set<string> {
  return new Set(
    stillWaiting(parked, now).flatMap((run) =>
      run.connectionId === undefined ? [] : [run.connectionId],
    ),
  );
}

/** The agents the mover moved less than the cooldown ago, from its memory. */
export function recentlyMovedIds(
  memory: SeatMoverMemory,
  settings: SeatMoverSettings,
  now: Date,
): Set<string> {
  const since = now.getTime() - settings.moveCooldownMinutes * 60_000;
  return new Set(
    Object.entries(memory.movedAt ?? {})
      .filter(([, at]) => Date.parse(at) > since)
      .map(([agentId]) => agentId),
  );
}

/** Agent id → where and when the mover moved it less than the cooldown ago, from its memory. */
export function recentMoves(
  memory: SeatMoverMemory,
  settings: SeatMoverSettings,
  now: Date,
): Map<string, RecentMove> {
  const moves = new Map<string, RecentMove>();
  for (const agentId of recentlyMovedIds(memory, settings, now)) {
    const connectionId = memory.movedTo?.[agentId];
    const at = memory.movedAt?.[agentId];
    if (connectionId !== undefined && at !== undefined) {
      moves.set(agentId, { connectionId, at });
    }
  }
  return moves;
}

/**
 * Where each agent sits, whether it has runs parked on that seat, whether
 * the mover moved it lately, and when, if it moved it onto the seat it sits
 * on now (HAL-19695). A run pinned to the agent's seat counts, and so
 * does one that names no seat (the board's audit rule 1), unless the mover
 * moved the agent lately: such a run is released after the move, and until
 * then it would move the agent again every pass.
 */
export function agentPlaces(
  agents: readonly AgentRow[],
  parked: readonly ParkedRun[],
  now: Date,
  recentlyMoved: ReadonlySet<string> = new Set(),
  moves: ReadonlyMap<string, RecentMove> = new Map(),
): AgentPlace[] {
  const waiting = stillWaiting(parked, now);
  return agents
    .filter((agent) => agent.status !== "terminated")
    .map((agent) => {
      const connectionId = connectionOf(agent);
      const lastMove = moves.get(agent.id);
      return {
        id: agent.id,
        key: (agent.urlKey ?? agent.name).toLowerCase(),
        name: agent.name,
        paused: agent.status === "paused",
        connectionId,
        parked: waiting.some(
          (run) =>
            run.agentId === agent.id &&
            connectionId !== undefined &&
            (run.connectionId === connectionId ||
              (run.connectionId === undefined && !recentlyMoved.has(agent.id))),
        ),
        recentlyMoved: recentlyMoved.has(agent.id),
        arrivedAt:
          lastMove !== undefined && lastMove.connectionId === connectionId
            ? lastMove.at
            : undefined,
      };
    });
}

export async function seatMoverPass(deps: SeatMoverDeps): Promise<SeatPlan | undefined> {
  const { settings, now } = deps;
  if (settings.mode === "off") {
    return undefined;
  }
  const since = new Date(now.getTime() - quotaLookbackMs).toISOString();
  const [connections, readings, parked, quota, agentRows, resets] = await Promise.all([
    deps.api.connections().then(parseConnections),
    deps.api.seatReadings().then(parseSeatReadings),
    deps.runs.parked(deps.companyId),
    deps.runs.quotaFailuresSince(deps.companyId, since),
    deps.agents(),
    deps.resets(),
  ]);
  const quotaAt = new Map(quota.map((failure) => [failure.connectionId, failure.at]));
  const maxAge = settings.readingMaxAgeMinutes;
  const waitingOn = seatsWaitedOn(parked, now);
  const seatList = buildSeats(
    connections,
    readings,
    quotaAt,
    now,
    maxAge,
    resets,
    waitingOn,
    settings.quotaFullMinutes,
  );
  const seats = new Map(seatList.map((seat) => [seat.connectionId, seat]));
  const memory = await deps.memory.get();
  const recentlyMoved = recentlyMovedIds(memory, settings, now);
  const moves = recentMoves(memory, settings, now);
  const agents = agentPlaces(agentRows, parked, now, recentlyMoved, moves);
  const plan = planMoves(seatList, agents, settings, now);
  if (plan.refused.length > 0) {
    deps.logError("Seat mover: the batch would break the checklist, so nobody moves this pass.", {
      breaks: plan.refused,
    });
  }
  for (const move of plan.moves) {
    deps.log(`Seat mover (${settings.mode}): ${moveLine(move, seats)}`);
  }
  if (settings.mode === "shadow") {
    await shadowReport(deps, plan, seats);
    return plan;
  }
  const moved = await applyMoves(deps, plan, seats, agents);
  await rememberMoves(deps, moved);
  const released = await releaseParked(deps, agents, moved, parked);
  if (settings.logTask !== undefined && (plan.moves.length > 0 || released > 0)) {
    await deps.comment(settings.logTask, batchComment(plan, seats, "act", released));
  }
  await tellStuck(deps, plan, seats);
  return plan;
}

async function shadowReport(deps: SeatMoverDeps, plan: SeatPlan, seats: ReadonlyMap<string, Seat>) {
  if (plan.moves.length === 0 && plan.stuck.length === 0) {
    return;
  }
  const body = batchComment(plan, seats, "shadow", 0);
  const memory = await deps.memory.get();
  if (deps.settings.logTask === undefined || memory.lastShadow === body) {
    return;
  }
  await deps.comment(deps.settings.logTask, body);
  await deps.memory.set({ ...memory, lastShadow: body });
}

/**
 * Sends each move; answers agent id → the seat it now sits on, for the moves
 * that went through. Before each move its target is checked again against
 * where agents actually sit, so a move that failed earlier in the batch (an
 * agent that didn't leave) never lets a later one break the checklist. Its
 * arrivals are the moves sent this pass and the earlier passes' moves since
 * the target's reading (HAL-19695).
 */
async function applyMoves(
  deps: SeatMoverDeps,
  plan: SeatPlan,
  seats: ReadonlyMap<string, Seat>,
  agents: readonly AgentPlace[],
): Promise<Map<string, string>> {
  const moved = new Map<string, string>();
  const actual = new Map<string, string>();
  for (const agent of agents) {
    if (agent.connectionId !== undefined) {
      actual.set(agent.id, agent.connectionId);
    }
  }
  for (const move of plan.moves) {
    const arriving = seatedOn(move.to.connectionId, actual, agents).filter(
      (agent) => moved.has(agent.id) || arrivedSinceReading(agent, move.to),
    ).length;
    const { settings, now } = deps;
    const refusal = targetRefusal(move.to, move.agent, actual, agents, settings, now, arriving);
    if (refusal !== undefined) {
      deps.logError(`Seat mover: ${move.agent.name} not moved, the target now fails ${refusal}.`, {
        move: moveLine(move, seats),
      });
      continue;
    }
    try {
      const outcome = await moveAgent(deps.api, move);
      if (outcome === "skipped-placement-changed") {
        deps.log(
          `Seat mover: ${move.agent.name} was moved by someone else since the read; left alone.`,
        );
        continue;
      }
      if (outcome === "moved-heartbeat-restored") {
        deps.logError(
          `Seat mover: ${move.agent.name}'s heartbeat changed with the move and was put back.`,
        );
      }
      moved.set(move.agent.id, move.to.connectionId);
      actual.set(move.agent.id, move.to.connectionId);
    } catch (error) {
      deps.logError(`Seat mover: couldn't move ${move.agent.name}: ${(error as Error).message}`, {
        move: moveLine(move, seats),
      });
    }
  }
  return moved;
}

/**
 * Notes when each agent moved and to which seat, for the cooldown and the
 * arrivals since a seat's reading, and drops entries past the cooldown.
 */
async function rememberMoves(deps: SeatMoverDeps, moved: ReadonlyMap<string, string>) {
  const memory = await deps.memory.get();
  const recent = recentlyMovedIds(memory, deps.settings, deps.now);
  const keep = (entries: Readonly<Record<string, string>>) =>
    Object.entries(entries).filter(([agentId]) => recent.has(agentId));
  const keptAt = keep(memory.movedAt ?? {});
  const keptTo = keep(memory.movedTo ?? {});
  const movedNow = [...moved.keys()].map((agentId) => [agentId, deps.now.toISOString()]);
  const unchanged =
    keptAt.length === Object.keys(memory.movedAt ?? {}).length &&
    keptTo.length === Object.keys(memory.movedTo ?? {}).length;
  if (movedNow.length === 0 && unchanged) {
    return;
  }
  await deps.memory.set({
    ...memory,
    movedAt: Object.fromEntries([...keptAt, ...movedNow]),
    movedTo: Object.fromEntries([...keptTo, ...moved.entries()]),
  });
}

/** Releases runs parked on seats their agents have left; wakes each task once. Answers how many. */
async function releaseParked(
  deps: SeatMoverDeps,
  agents: readonly AgentPlace[],
  moved: ReadonlyMap<string, string>,
  parked: readonly ParkedRun[],
): Promise<number> {
  const seatOf = new Map<string, string>();
  for (const agent of agents) {
    const seat = moved.get(agent.id) ?? agent.connectionId;
    if (seat !== undefined) {
      seatOf.set(agent.id, seat);
    }
  }
  const movedIds = new Set(moved.keys());
  const runs = runsToRelease(parked, seatOf, deps.now, movedIds).slice(0, releasesPerPass);
  const woken = new Set<string>();
  let released = 0;
  for (const run of runs) {
    try {
      const status = run.issueId === undefined ? undefined : await deps.issueStatus(run.issueId);
      await releaseRun(deps.api, run, status);
      released += 1;
      if (run.issueId !== undefined && !woken.has(run.issueId)) {
        woken.add(run.issueId);
        await deps.wake(run.issueId, `seat-mover ${run.id}`);
      }
    } catch (error) {
      deps.logError(`Seat mover: couldn't release run ${run.id}: ${(error as Error).message}`);
    }
  }
  return released;
}

/** Tells the board once per agent and seat when an agent must move and no seat may take it. */
async function tellStuck(deps: SeatMoverDeps, plan: SeatPlan, seats: ReadonlyMap<string, Seat>) {
  const memory = await deps.memory.get();
  const noted = new Set(memory.stuckNoted ?? []);
  const now = plan.stuck.map((stuck) => ({ stuck, key: `${stuck.agent.id}|${stuck.from ?? ""}` }));
  const task = deps.settings.boardTask ?? deps.settings.logTask;
  for (const { stuck, key } of now) {
    if (noted.has(key) || task === undefined) {
      continue;
    }
    await deps.comment(task, stuckNote(stuck, seats));
    noted.add(key);
  }
  // Once an agent is no longer stuck there, a later stop there is news again.
  const still = [...noted].filter((key) => now.some((entry) => entry.key === key));
  if (
    still.length !== (memory.stuckNoted ?? []).length ||
    still.some((key) => !memory.stuckNoted?.includes(key))
  ) {
    await deps.memory.set({ ...memory, stuckNoted: still });
  }
}
