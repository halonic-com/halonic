import { moveAgent, releaseRun, runsToRelease } from "./act.ts";
import type { SeatApi } from "./api.ts";
import { type AgentPlace, type Seat, targetRefusal } from "./checklist.ts";
import { planMoves, type SeatPlan } from "./plan.ts";
import { buildSeats, parseConnections, parseSeatReadings } from "./readings.ts";
import { batchComment, moveLine, stuckNote } from "./report.ts";
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
}

export interface SeatMoverDeps {
  readonly companyId: string;
  readonly now: Date;
  readonly settings: SeatMoverSettings;
  readonly api: SeatApi;
  readonly runs: SeatRuns;
  readonly agents: () => Promise<readonly AgentRow[]>;
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
 * Where each agent sits, and whether it has runs parked on that seat. Only a
 * run pinned to the seat counts: a run that names no seat is never released
 * after a move, so it would move the agent again every pass.
 */
export function agentPlaces(
  agents: readonly AgentRow[],
  parked: readonly ParkedRun[],
): AgentPlace[] {
  return agents
    .filter((agent) => agent.status !== "terminated")
    .map((agent) => {
      const connectionId = connectionOf(agent);
      return {
        id: agent.id,
        key: (agent.urlKey ?? agent.name).toLowerCase(),
        name: agent.name,
        paused: agent.status === "paused",
        connectionId,
        parked: parked.some(
          (run) =>
            run.agentId === agent.id &&
            connectionId !== undefined &&
            run.connectionId === connectionId,
        ),
      };
    });
}

export async function seatMoverPass(deps: SeatMoverDeps): Promise<SeatPlan | undefined> {
  const { settings, now } = deps;
  if (settings.mode === "off") {
    return undefined;
  }
  const since = new Date(now.getTime() - quotaLookbackMs).toISOString();
  const [connections, readings, parked, quota, agentRows] = await Promise.all([
    deps.api.connections().then(parseConnections),
    deps.api.seatReadings().then(parseSeatReadings),
    deps.runs.parked(deps.companyId),
    deps.runs.quotaFailuresSince(deps.companyId, since),
    deps.agents(),
  ]);
  const quotaAt = new Map(quota.map((failure) => [failure.connectionId, failure.at]));
  const seatList = buildSeats(connections, readings, quotaAt, now, settings.readingMaxAgeMinutes);
  const seats = new Map(seatList.map((seat) => [seat.connectionId, seat]));
  const agents = agentPlaces(agentRows, parked);
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
 * agent that didn't leave) never lets a later one break the checklist.
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
    const refusal = targetRefusal(move.to, move.agent, actual, agents, deps.settings, deps.now);
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
  const runs = runsToRelease(parked, seatOf, deps.now).slice(0, releasesPerPass);
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
