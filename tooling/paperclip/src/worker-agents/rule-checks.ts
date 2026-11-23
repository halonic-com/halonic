import { inProgressLimit, type LoadTask, teamLoad } from "../board-check/load.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";

/**
 * The 5 rule checks of the Worker agents page (HAL-16250, addendum 2 on
 * HAL-15997, section 1). The board check works them out on every pass from
 * its listing of open tasks and the PR watcher's GitHub snapshot, and saves
 * them; the page only reads what was saved. A check that isn't OK names the
 * task or pull request to fix and a short reason in our own words, never
 * text an agent wrote.
 */

/** OK, Check (worth a look, or a guess from timestamps), Problem (breaks the rule now), or can't run. */
export type CheckStatus = "ok" | "check" | "problem" | "unavailable" | "not_checked";

/** The checks in the page's column order. */
export const ruleNames = [
  "newWorkOnRedPr",
  "taskState",
  "monitors",
  "workload",
  "branchNames",
] as const;
export type RuleName = (typeof ruleNames)[number];

/** What a check that isn't OK links to: a task by its key, or a pull request by its number and URL. */
export type CheckLink =
  | { readonly kind: "task"; readonly identifier: string }
  | { readonly kind: "pr"; readonly number: number; readonly url: string };

/** One thing to fix. */
export interface Finding {
  readonly link: CheckLink;
  readonly reason: string;
}

/** One check's result for one agent; `reason` says why a check didn't run. */
export interface RuleCheck {
  readonly status: CheckStatus;
  readonly findings: readonly Finding[];
  readonly reason?: string;
}

export type AgentChecks = Readonly<Record<RuleName, RuleCheck>>;

/** What the board check saves after each pass. */
export interface RuleChecksRecord {
  readonly at: string;
  /** When the GitHub snapshot the PR checks used was taken, or null before the first one. */
  readonly prDataAt: string | null;
  /** By agent id. */
  readonly agents: Readonly<Record<string, AgentChecks>>;
}

/** An open task as the checks read it. */
export interface CheckTask extends LoadTask {
  readonly identifier: string;
  /** A run is queued or running on it. */
  readonly running: boolean;
  readonly monitorNextCheckAt: string | null;
  readonly monitorLastTriggeredAt: string | null;
  /** Pull request numbers its monitor's notes name; the notes themselves aren't kept. */
  readonly monitorPulls: readonly number[];
  readonly startedAt: string | null;
  /** Blocked with the board as its owner, or in review with a pending board card. */
  readonly waitsOnBoard: boolean;
}

/** An agent as the checks read it. */
export interface CheckAgent {
  readonly id: string;
  readonly urlKey: string;
  readonly status: string;
}

/** An open pull request from our own repository, as the checks read it. */
export interface CheckPull {
  readonly number: number;
  readonly url: string;
  readonly branch: string;
  /** When anything last happened on it: a push, a comment, a label. */
  readonly updatedAt: string;
  readonly draft: boolean;
  readonly ciFailed: boolean;
  readonly conflicting: boolean;
}

/** A monitor firing more often than this breaks the monitor rule (HAL-15308 R1). */
export const shortestMonitorMs = 15 * 60_000;

const ok: RuleCheck = { status: "ok", findings: [] };
const unavailable: RuleCheck = { status: "unavailable", findings: [] };

function result(status: "check" | "problem", findings: readonly Finding[]): RuleCheck {
  return findings.length === 0 ? ok : { status, findings };
}

const taskLink = (identifier: string): CheckLink => ({ kind: "task", identifier });
const prLink = (pull: CheckPull): CheckLink => ({ kind: "pr", number: pull.number, url: pull.url });

function monitorSet(task: CheckTask, now: Date): boolean {
  return task.monitorNextCheckAt !== null && Date.parse(task.monitorNextCheckAt) > now.getTime();
}

/** Why a task's state leaves nothing to wake anyone (HAL-15308 R2), or undefined when it's valid. */
export function invalidState(task: CheckTask, now: Date): string | undefined {
  if (task.running || monitorSet(task, now) || task.waitsOnBoard) {
    return undefined;
  }
  if (task.status === "in_progress") {
    return "In progress, nothing set to wake";
  }
  if (task.status === "in_review") {
    return "In review, no board card and nothing set to wake";
  }
  if (task.status === "blocked" && task.blockerAttention?.unresolvedBlockerCount === 0) {
    return "Blocked, nothing open in blocked by";
  }
  return undefined;
}

/** Check 1: a task started after the agent's red or conflicting PR last changed, so while it was already red. */
function newWorkOnRedPr(own: readonly CheckTask[], pulls: readonly CheckPull[]): RuleCheck {
  const findings = pulls
    .filter((pull) => !pull.draft && (pull.ciFailed || pull.conflicting))
    .flatMap((pull) =>
      own
        .filter(
          (task) =>
            task.startedAt !== null &&
            task.identifier !== taskOfBranch(pull.branch) &&
            Date.parse(task.startedAt) > Date.parse(pull.updatedAt),
        )
        .map((task) => ({
          link: prLink(pull),
          reason: `${pull.conflicting ? "Conflicting" : "ci-ok failed"} when ${task.identifier} started`,
        })),
    );
  // Estimated from timestamps, so never more than "Check".
  return result("check", findings);
}

/** Check 3, first half: the open PRs watched by monitors on two or more tasks. */
function watchedTwice(tasks: readonly CheckTask[], pulls: readonly CheckPull[], now: Date) {
  const watchers = new Map<number, Set<string>>();
  const watch = (number: number, task: CheckTask) =>
    watchers.set(number, (watchers.get(number) ?? new Set()).add(task.identifier));
  for (const task of tasks.filter((candidate) => monitorSet(candidate, now))) {
    const ownPulls = pulls.filter((open) => taskOfBranch(open.branch) === task.identifier);
    for (const number of [...task.monitorPulls, ...ownPulls.map((pull) => pull.number)]) {
      watch(number, task);
    }
  }
  return pulls.flatMap((pull) => {
    const identifiers = [...(watchers.get(pull.number) ?? [])].sort();
    return identifiers.length > 1 ? [{ pull, identifiers }] : [];
  });
}

/** Check 3: two tasks watching one PR, and monitors that fire more often than every 15 minutes (estimated). */
function monitors(
  own: readonly CheckTask[],
  twice: ReturnType<typeof watchedTwice>,
  now: Date,
): RuleCheck {
  const ownKeys = new Set(own.map((task) => task.identifier));
  const shared = twice
    .filter(({ identifiers }) => identifiers.some((identifier) => ownKeys.has(identifier)))
    .map(({ pull, identifiers }) => ({
      link: prLink(pull),
      reason: `Watched by ${identifiers.join(" and ")}`,
    }));
  const frequent = own.flatMap((task) => {
    if (!monitorSet(task, now) || task.monitorLastTriggeredAt === null) {
      return [];
    }
    const gapMs =
      Date.parse(task.monitorNextCheckAt ?? "") - Date.parse(task.monitorLastTriggeredAt);
    return gapMs < shortestMonitorMs
      ? [
          {
            link: taskLink(task.identifier),
            reason: `Monitor fires about every ${Math.max(1, Math.round(gapMs / 60_000))} min`,
          },
        ]
      : [];
  });
  return result("check", [...shared, ...frequent]);
}

/**
 * Check 4: nothing startable, or more than 10 tasks in progress, as the board
 * check's team load counts them (addendum 1c). Neither has one task to fix,
 * so the reason says it instead of a link.
 */
function workload(agent: CheckAgent, own: readonly CheckTask[]): RuleCheck {
  if (agent.status === "paused") {
    return { status: "not_checked", findings: [], reason: "paused" };
  }
  const load = teamLoad(own, [agent]);
  const overloaded = load.overloaded[0];
  if (overloaded !== undefined) {
    const reason = `${overloaded.inProgress} in progress, more than ${inProgressLimit}`;
    return { status: "problem", findings: [], reason };
  }
  return load.idle.length > 0 ? { status: "check", findings: [], reason: "Nothing to start" } : ok;
}

/** Check 5: the agent's open PRs whose branch doesn't read `<agent>/HAL-<n>-<words>` (HAL-16173). */
function branchNames(agent: CheckAgent, pulls: readonly CheckPull[]): RuleCheck {
  const name = agent.urlKey.replace(/[^\w-]/g, "\\$&");
  const pattern = new RegExp(`^${name}/HAL-\\d+-\\w`, "i");
  const findings = pulls
    .filter((pull) => !pattern.test(pull.branch))
    .map((pull) => ({
      link: prLink(pull),
      reason: "Branch doesn't follow <agent>/HAL-<n>-<words>",
    }));
  return result("problem", findings);
}

/** The pull requests whose branch starts with the agent's name. */
function pullsOf(agent: CheckAgent, pulls: readonly CheckPull[]): CheckPull[] {
  const prefix = `${agent.urlKey.toLowerCase()}/`;
  return pulls.filter((pull) => pull.branch.toLowerCase().startsWith(prefix));
}

/**
 * Every agent's 5 checks. `pulls` is undefined before the PR watcher's first
 * snapshot: the checks that need it then say "Not available yet" instead of OK.
 */
export function ruleChecks(
  agents: readonly CheckAgent[],
  tasks: readonly CheckTask[],
  pulls: readonly CheckPull[] | undefined,
  now: Date,
): Record<string, AgentChecks> {
  const twice = pulls === undefined ? [] : watchedTwice(tasks, pulls, now);
  return Object.fromEntries(
    agents.map((agent) => {
      const own = tasks.filter((task) => task.assigneeAgentId === agent.id);
      const theirs = pulls === undefined ? undefined : pullsOf(agent, pulls);
      const stateFindings = own.flatMap((task) => {
        const reason = invalidState(task, now);
        return reason === undefined ? [] : [{ link: taskLink(task.identifier), reason }];
      });
      const checks: AgentChecks = {
        newWorkOnRedPr: theirs === undefined ? unavailable : newWorkOnRedPr(own, theirs),
        taskState: result("problem", stateFindings),
        monitors: monitors(own, twice, now),
        workload: workload(agent, own),
        branchNames: theirs === undefined ? unavailable : branchNames(agent, theirs),
      };
      return [agent.id, checks];
    }),
  );
}

/** How many of an agent's checks are Problems and how many are Checks. */
export function checkCounts(checks: AgentChecks | undefined): {
  problems: number;
  toCheck: number;
} {
  const statuses = checks === undefined ? [] : ruleNames.map((name) => checks[name].status);
  return {
    problems: statuses.filter((status) => status === "problem").length,
    toCheck: statuses.filter((status) => status === "check").length,
  };
}

/** Reads a saved record back; anything odd counts as no pass yet. */
export function readRuleChecks(value: unknown): RuleChecksRecord | undefined {
  const record = value as Partial<RuleChecksRecord> | null;
  return typeof record?.at === "string" &&
    typeof record.agents === "object" &&
    record.agents !== null
    ? { at: record.at, prDataAt: record.prDataAt ?? null, agents: record.agents }
    : undefined;
}
