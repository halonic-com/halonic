import type { Money, TeamRun, TeamRunState, TokenCount } from "@halonicjs/ports";
import type { PaperclipIds } from "./ids.ts";
import { asRecord, field, type JsonRecord, text } from "./json.ts";

/**
 * How many finished runs one read asks for. `heartbeat-runs` has no time
 * bound and no paging, so the newest this many are all a read can see.
 */
export const finishedRunsLimit = 200;

/** A task's short name and title, as `getTask` answers them. */
export interface TaskName {
  identifier: string;
  title: string;
}

/** What the run mapper needs besides the run. */
export interface RunContext {
  ids: PaperclipIds;
  /** Each task's name by Paperclip ID; `undefined` for a task the key couldn't read. */
  tasks: ReadonlyMap<string, TaskName | undefined>;
}

/** The runs one answer is made of, and whether the finished ones reach back to the bound. */
export interface PickedRuns {
  runs: readonly JsonRecord[];
  complete: boolean;
}

/** Paperclip's run statuses, as the port names them; any other status isn't shown. */
const states: Readonly<Record<string, TeamRunState>> = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  timed_out: "timed-out",
  interrupted: "interrupted",
};

/** Run `record`'s state, or `undefined` for a status the port has no word for. */
export function runState(record: JsonRecord): TeamRunState | undefined {
  const status = text(record, "status");
  return status === undefined ? undefined : states[status];
}

function isLive(record: JsonRecord): boolean {
  const state = runState(record);
  return state === "queued" || state === "running";
}

/** When the run started, or was made while it is still queued, in milliseconds. */
function startTime(record: JsonRecord): number {
  return Date.parse(text(record, "startedAt") ?? text(record, "createdAt") ?? "") || 0;
}

const newestFirst = (left: JsonRecord, right: JsonRecord): number =>
  startTime(right) - startTime(left);

/**
 * The live runs, then the finished runs that started at or after `since`,
 * each newest first, of `agent` only when given. A run in both answers is
 * shown once, as live. The finished runs are complete when the read
 * returned fewer than it asked for, or reached back past the bound.
 */
export function pickRuns(
  answers: { live: readonly JsonRecord[]; finished: readonly JsonRecord[] },
  query: { agent?: string; since?: string },
): PickedRuns {
  const ofAgent = (record: JsonRecord) =>
    query.agent === undefined || text(record, "agentId") === query.agent;
  const live = answers.live.filter((record) => ofAgent(record) && isLive(record));
  const liveIds = new Set(live.map((record) => text(record, "id")));
  const since = query.since === undefined ? Number.NaN : Date.parse(query.since);
  const finished = answers.finished.filter(
    (record) =>
      ofAgent(record) &&
      !isLive(record) &&
      !liveIds.has(text(record, "id")) &&
      startTime(record) >= since,
  );
  const reachesBound = answers.finished.some((record) => startTime(record) < since);
  return {
    runs: [...live.sort(newestFirst), ...finished.sort(newestFirst)],
    complete: answers.finished.length < finishedRunsLimit || reachesBound,
  };
}

/** A whole number of at least 0 from field `name`, or `undefined`. */
function amount(record: JsonRecord, name: string): number | undefined {
  const value = field(record, name);
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** The run's billed money: Paperclip reports it in dollars, with fractions of a cent. */
function paidOf(record: JsonRecord): Pick<TeamRun, "paid"> {
  const dollars = amount(record, "costUsd");
  const paid: Money | undefined =
    dollars === undefined ? undefined : { cents: Math.round(dollars * 100), currency: "USD" };
  return paid === undefined ? {} : { paid };
}

/** The run's tokens, when Paperclip counted any kind of them. */
function tokensOf(record: JsonRecord): Pick<TeamRun, "tokens"> {
  const input = amount(record, "inputTokens");
  const cached = amount(record, "cachedInputTokens");
  const output = amount(record, "outputTokens");
  if (input === undefined && cached === undefined && output === undefined) {
    return {};
  }
  const tokens: TokenCount = { input: input ?? 0, cached: cached ?? 0, output: output ?? 0 };
  return { tokens };
}

/** The latest of the run's times that say it did something. */
function lastActivityOf(record: JsonRecord): Pick<TeamRun, "lastActivityAt"> {
  const times = ["lastEventAt", "lastOutputAt", "finishedAt", "startedAt"]
    .map((name) => text(record, name))
    .filter((time): time is string => time !== undefined && !Number.isNaN(Date.parse(time)));
  const latest = times.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  return latest === undefined ? {} : { lastActivityAt: latest };
}

/** The run's task, its name left out when the key couldn't read it. */
function taskOf(context: RunContext, record: JsonRecord): Pick<TeamRun, "task"> {
  const task = text(record, "issueId");
  if (task === undefined) {
    return {};
  }
  const name = context.tasks.get(task);
  return { task: { id: context.ids.make("task", task), ...name } };
}

/** A time field, when it is one. */
function timeOf(record: JsonRecord, name: "startedAt" | "finishedAt"): Partial<TeamRun> {
  const time = text(record, name);
  return time === undefined || Number.isNaN(Date.parse(time)) ? {} : { [name]: time };
}

/**
 * Run `record` as the port's `TeamRun`, or `undefined` without an ID, an
 * agent or a known state. Only the port's fields are read: the answer's
 * excerpts, log reference, wake context and errors are never copied.
 */
export function toTeamRun(context: RunContext, record: JsonRecord): TeamRun | undefined {
  const id = text(record, "id");
  const agent = text(record, "agentId");
  const state = runState(record);
  if (id === undefined || agent === undefined || state === undefined) {
    return undefined;
  }
  const canStop = isLive(record) && field(asRecord(field(record, "execution")), "canStop") === true;
  return {
    id: context.ids.make("run", id),
    source: context.ids.source(),
    agent: context.ids.make("agent", agent),
    ...taskOf(context, record),
    state,
    ...timeOf(record, "startedAt"),
    ...(isLive(record) ? {} : timeOf(record, "finishedAt")),
    ...lastActivityOf(record),
    ...paidOf(record),
    ...tokensOf(record),
    canStop,
  };
}

/** A task's name from a `getTask` answer, or `undefined` without both parts. */
export function toTaskName(answer: unknown): TaskName | undefined {
  const record = asRecord(answer);
  const identifier = text(record, "identifier");
  const title = text(record, "title");
  return identifier === undefined || title === undefined ? undefined : { identifier, title };
}
