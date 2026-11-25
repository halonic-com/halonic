/**
 * The Worker agents page's 5 rule checks as a signal rule (HAL-18319, plan
 * HAL-17450 rev 5, "Step 2"): from one pass's open tasks, agents and the PR
 * watcher's open pull requests, the record the page reads. A ToolScript rule
 * like `pr-watcher.ts`: JSON in, an action list out, type imports only, no
 * I/O and time only from `input.now`. It gives the same checks as
 * `worker-agents/rule-checks.ts` (with the team load of `board-check/load.ts`
 * and the branch reading of `pr-watcher/discover.ts`), which a parity test
 * holds it to until the board check runs on it. Its one action only saves
 * the record for the page: it writes nothing in Paperclip.
 */

/** OK, Check (worth a look, or a guess from timestamps), Problem (breaks the rule now), or can't run. */
export type CheckStatus = "ok" | "check" | "problem" | "unavailable" | "not_checked";

/** What a check that isn't OK links to: a task by its key, or a pull request by its number and URL. */
export type CheckLink =
  | { readonly kind: "task"; readonly identifier: string }
  | { readonly kind: "pr"; readonly number: number; readonly url: string };

/** One thing to fix, with a reason in the rule's own words. */
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

/** An agent's 5 checks, by name, in the page's column order. */
export type AgentChecks = Readonly<
  Record<"newWorkOnRedPr" | "taskState" | "monitors" | "workload" | "branchNames", RuleCheck>
>;

/** An open task as the checks read it, as `CheckTask`. */
export interface ChecksTask {
  readonly identifier: string;
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly blockerAttention?: { readonly unresolvedBlockerCount: number } | null;
  /** A run is queued or running on it. */
  readonly running: boolean;
  readonly monitorNextCheckAt: string | null;
  readonly monitorLastTriggeredAt: string | null;
  /** Pull request numbers its monitor's notes name; the notes themselves aren't passed in. */
  readonly monitorPulls: readonly number[];
  readonly startedAt: string | null;
  /** Blocked with the board as its owner, or in review with a pending board card. */
  readonly waitsOnBoard: boolean;
}

/** An agent as the checks read it. */
export interface ChecksAgent {
  readonly id: string;
  readonly urlKey: string;
  readonly status: string;
}

/** An open pull request from our own repository, as the checks read it. */
export interface ChecksPull {
  readonly number: number;
  readonly url: string;
  readonly branch: string;
  /** When anything last happened on it: a push, a comment, a label. */
  readonly updatedAt: string;
  readonly draft: boolean;
  readonly ciFailed: boolean;
  readonly conflicting: boolean;
}

/** The rule's settings, from the signal file or the defaults. */
export interface RuleChecksSettings {
  readonly shortestMonitorMinutes: number;
  readonly inProgressLimit: number;
}

/** One pass's input. */
export interface RuleChecksInput {
  readonly now: string;
  readonly settings: RuleChecksSettings;
  readonly agents: readonly ChecksAgent[];
  readonly tasks: readonly ChecksTask[];
  /** Null before the PR watcher's first snapshot: the PR checks then say "Not available yet". */
  readonly pulls: readonly ChecksPull[] | null;
  /** When that snapshot was taken, or null before the first one. */
  readonly prDataAt: string | null;
}

/** Save the record the Worker agents page reads; nothing in Paperclip changes. */
export interface SaveRuleChecksAction {
  readonly kind: "save-rule-checks";
  readonly record: {
    readonly at: string;
    readonly prDataAt: string | null;
    /** By agent id. */
    readonly agents: Readonly<Record<string, AgentChecks>>;
  };
}

/** The agent the team load leaves out, as `leftOut`. */
const leftOut = "pip";

const notWorking = new Set(["paused", "pending_approval", "terminated"]);

const ok: RuleCheck = { status: "ok", findings: [] };
const unavailable: RuleCheck = { status: "unavailable", findings: [] };

function result(status: "check" | "problem", findings: readonly Finding[]): RuleCheck {
  return findings.length === 0 ? ok : { status, findings };
}

const taskLink = (identifier: string): CheckLink => ({ kind: "task", identifier });
const prLink = ({ number, url }: ChecksPull): CheckLink => ({ kind: "pr", number, url });

/** The task a branch names, as `taskOfBranch`: `mateo/HAL-42-words` names `HAL-42`. */
function taskOfBranch(branch: string): string | undefined {
  return /^[\w.-]+\/([a-z]+-\d+)(?:-|$)/i.exec(branch)?.[1]?.toUpperCase();
}

function monitorSet(task: ChecksTask, nowMs: number): boolean {
  return task.monitorNextCheckAt !== null && Date.parse(task.monitorNextCheckAt) > nowMs;
}

/** Why a task's state leaves nothing to wake anyone (HAL-15308 R2), or undefined when it's valid. */
function invalidState(task: ChecksTask, nowMs: number): string | undefined {
  if (task.running || monitorSet(task, nowMs) || task.waitsOnBoard) {
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

/** Check 1: a task started after the agent's red or conflicting PR last changed (estimated, so a Check). */
function newWorkOnRedPr(own: readonly ChecksTask[], pulls: readonly ChecksPull[]): RuleCheck {
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
  return result("check", findings);
}

/** Check 3, first half: the open PRs watched by monitors on two or more tasks. */
function watchedTwice(input: RuleChecksInput, pulls: readonly ChecksPull[], nowMs: number) {
  const watchers = new Map<number, Set<string>>();
  for (const task of input.tasks.filter((candidate) => monitorSet(candidate, nowMs))) {
    const ownPulls = pulls.filter((open) => taskOfBranch(open.branch) === task.identifier);
    for (const number of [...task.monitorPulls, ...ownPulls.map((pull) => pull.number)]) {
      watchers.set(number, (watchers.get(number) ?? new Set()).add(task.identifier));
    }
  }
  return pulls.flatMap((pull) => {
    const identifiers = [...(watchers.get(pull.number) ?? [])].sort();
    return identifiers.length > 1 ? [{ pull, identifiers }] : [];
  });
}

/** Check 3: two tasks watching one PR, and monitors that fire more often than the shortest gap. */
function monitors(
  own: readonly ChecksTask[],
  twice: ReturnType<typeof watchedTwice>,
  nowMs: number,
  settings: RuleChecksSettings,
): RuleCheck {
  const ownKeys = new Set(own.map((task) => task.identifier));
  const shared = twice
    .filter(({ identifiers }) => identifiers.some((identifier) => ownKeys.has(identifier)))
    .map(({ pull, identifiers }) => ({
      link: prLink(pull),
      reason: `Watched by ${identifiers.join(" and ")}`,
    }));
  const frequent = own.flatMap((task) => {
    if (!monitorSet(task, nowMs) || task.monitorLastTriggeredAt === null) {
      return [];
    }
    const gapMs =
      Date.parse(task.monitorNextCheckAt ?? "") - Date.parse(task.monitorLastTriggeredAt);
    if (gapMs >= settings.shortestMonitorMinutes * 60_000) {
      return [];
    }
    const minutes = Math.max(1, Math.round(gapMs / 60_000));
    return [
      { link: taskLink(task.identifier), reason: `Monitor fires about every ${minutes} min` },
    ];
  });
  return result("check", [...shared, ...frequent]);
}

/** Whether the agent can start the task, as the team load counts it. */
function startable(task: ChecksTask): boolean {
  if (task.status === "todo") {
    return true;
  }
  return (
    task.status === "in_progress" && (task.blockerAttention?.unresolvedBlockerCount ?? 0) === 0
  );
}

/** Check 4: nothing startable, or more tasks in progress than the limit, as `teamLoad` counts them. */
function workload(
  agent: ChecksAgent,
  own: readonly ChecksTask[],
  settings: RuleChecksSettings,
): RuleCheck {
  if (agent.status === "paused") {
    return { status: "not_checked", findings: [], reason: "paused" };
  }
  if (agent.urlKey === leftOut || notWorking.has(agent.status)) {
    return ok;
  }
  const inProgress = own.filter((task) => task.status === "in_progress").length;
  if (inProgress > settings.inProgressLimit) {
    const reason = `${inProgress} in progress, more than ${settings.inProgressLimit}`;
    return { status: "problem", findings: [], reason };
  }
  return own.some(startable) ? ok : { status: "check", findings: [], reason: "Nothing to start" };
}

/** Check 5: the agent's open PRs whose branch doesn't read `<agent>/HAL-<n>-<words>` (HAL-16173). */
function branchNames(agent: ChecksAgent, pulls: readonly ChecksPull[]): RuleCheck {
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
function pullsOf(agent: ChecksAgent, pulls: readonly ChecksPull[]): ChecksPull[] {
  const prefix = `${agent.urlKey.toLowerCase()}/`;
  return pulls.filter((pull) => pull.branch.toLowerCase().startsWith(prefix));
}

/** One agent's 5 checks. */
function checksOf(
  agent: ChecksAgent,
  input: RuleChecksInput,
  twice: ReturnType<typeof watchedTwice>,
  nowMs: number,
): AgentChecks {
  const own = input.tasks.filter((task) => task.assigneeAgentId === agent.id);
  const theirs = input.pulls === null ? undefined : pullsOf(agent, input.pulls);
  const stateFindings = own.flatMap((task) => {
    const reason = invalidState(task, nowMs);
    return reason === undefined ? [] : [{ link: taskLink(task.identifier), reason }];
  });
  return {
    newWorkOnRedPr: theirs === undefined ? unavailable : newWorkOnRedPr(own, theirs),
    taskState: result("problem", stateFindings),
    monitors: monitors(own, twice, nowMs, input.settings),
    workload: workload(agent, own, input.settings),
    branchNames: theirs === undefined ? unavailable : branchNames(agent, theirs),
  };
}

/**
 * The pass's one action: save every agent's 5 checks for the page.
 *
 * @example
 * decide({ now, settings: { shortestMonitorMinutes: 15, inProgressLimit: 10 }, agents: [], tasks: [], pulls: null, prDataAt: null });
 * // [{ kind: "save-rule-checks", record: { at: now, prDataAt: null, agents: {} } }]
 */
export function decide(input: RuleChecksInput): SaveRuleChecksAction[] {
  const nowMs = Date.parse(input.now);
  const twice = input.pulls === null ? [] : watchedTwice(input, input.pulls, nowMs);
  const agents = Object.fromEntries(
    input.agents.map((agent) => [agent.id, checksOf(agent, input, twice, nowMs)]),
  );
  return [
    { kind: "save-rule-checks", record: { at: input.now, prDataAt: input.prDataAt, agents } },
  ];
}
