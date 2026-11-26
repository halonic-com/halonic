import { personFor, type Routing, routingRoles } from "../routing.ts";

/**
 * The idle role check (the board, 26 Nov, HAL-19641): an agent that covers a
 * role and went live, but has had no task and no good run an hour later, is
 * reported once to Chief and on the board line. A reviewer once went live
 * and got almost no work for hours without anyone noticing.
 *
 * Who covers a role comes from the one shared source (`personFor` in
 * `routing.ts`, HAL-19639), never a list of our own. Paperclip doesn't say
 * when an agent went live, so the check counts from the first pass that sees
 * it live in a role; a pause, or losing the role, starts the count again.
 */

/** How long a live role holder may go without work before the report. */
export const idleRoleMinutes = 60;

/** Agent statuses that are live: it can be woken and run. */
const liveStatuses: ReadonlySet<string> = new Set(["active", "idle", "running", "error"]);

/** What the check reads about one agent (`ctx.agents.list`). */
export interface RoleAgent {
  readonly id: string;
  readonly urlKey: string;
  readonly name: string;
  readonly status: string;
  /** When its last run began; a string or a `Date`, as the host sends it. */
  readonly lastHeartbeatAt: string | Date | null;
}

/** One live role holder the check follows. */
interface Followed {
  /** When a pass first saw it live in a role. */
  readonly since: string;
  /** Set once it got work or was reported: nothing more to do until it goes live again. */
  readonly settled?: "worked" | "reported";
}

/** What the check keeps between passes, per company, by agent url key. */
export interface IdleRoleState {
  readonly version: 1;
  readonly followed: Readonly<Record<string, Followed>>;
}

export const emptyIdleRole: IdleRoleState = { version: 1, followed: {} };

/** One report: an agent with a role and no work an hour after going live. */
export interface IdleRole {
  readonly agent: string;
  readonly roles: readonly string[];
  readonly since: string;
  readonly minutes: number;
}

/** Each agent's url key with the roles it covers, from the shared source. */
export function roleHolders(routing: Routing | undefined): Map<string, string[]> {
  const holders = new Map<string, string[]>();
  for (const role of routingRoles) {
    const agent = personFor(role, routing);
    holders.set(agent, [...(holders.get(agent) ?? []), role]);
  }
  return holders;
}

function time(value: string | Date | null): number {
  return value === null ? Number.NaN : new Date(value).getTime();
}

/**
 * It got work since `since`: a task assigned to it, or a run that began then
 * and didn't leave it in `error`.
 */
function gotWork(agent: RoleAgent, since: string, assigned: ReadonlySet<string>): boolean {
  const ranSince = time(agent.lastHeartbeatAt) >= Date.parse(since);
  return assigned.has(agent.id) || (ranSince && agent.status !== "error");
}

/** What a pass needs. */
export interface IdleRoleInput {
  readonly agents: readonly RoleAgent[];
  /** The ids of agents holding an open task (any status but done and cancelled). */
  readonly assigned: ReadonlySet<string>;
  readonly routing: Routing | undefined;
  readonly now: Date;
}

/**
 * The reports due in this pass and the state to save. An agent that is no
 * longer live, or no longer covers a role, is dropped, so it counts again
 * from the next pass that sees it live in one.
 */
export function idleRolePass(
  before: IdleRoleState,
  input: IdleRoleInput,
): { readonly reports: readonly IdleRole[]; readonly state: IdleRoleState } {
  const { agents, assigned, routing, now } = input;
  const byKey = new Map(agents.map((agent) => [agent.urlKey.toLowerCase(), agent]));
  const followed: Record<string, Followed> = {};
  const reports: IdleRole[] = [];
  for (const [key, roles] of roleHolders(routing)) {
    const agent = byKey.get(key);
    if (agent === undefined || !liveStatuses.has(agent.status)) {
      continue;
    }
    const was = before.followed[key];
    const since = was?.since ?? now.toISOString();
    if (was?.settled !== undefined) {
      followed[key] = was;
      continue;
    }
    if (gotWork(agent, since, assigned)) {
      followed[key] = { since, settled: "worked" };
      continue;
    }
    const minutes = Math.floor((now.getTime() - Date.parse(since)) / 60_000);
    if (minutes >= idleRoleMinutes) {
      reports.push({ agent: agent.name, roles, since, minutes });
      followed[key] = { since, settled: "reported" };
    } else {
      followed[key] = { since };
    }
  }
  return { reports, state: { version: 1, followed } };
}

/** The report's comment, for Chief's chat and the board line. */
export function idleRoleText(reports: readonly IdleRole[]): string {
  const lines = reports.map(
    (report) =>
      `- ${report.agent} (${report.roles.join(", ")}): live since ${report.since}, ${report.minutes} min with no task and no good run`,
  );
  const count =
    reports.length === 1 ? "1 agent with a role has" : `${reports.length} agents with a role have`;
  return [
    `Idle role: ${count} had no work in the ${idleRoleMinutes} minutes since going live. Check that work reaches them (routing, wake tasks, the reviewer source):`,
    ...lines,
  ].join("\n");
}
