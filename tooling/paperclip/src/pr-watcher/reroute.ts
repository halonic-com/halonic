import { amsterdamTime } from "../amsterdam-time.ts";
import { branchOwner, marker, type PullFacts, short } from "./decide.ts";
import type { Reviewer, ReviewerRoute } from "./handoff.ts";
import { readMemory } from "./memory.ts";
import type { Paperclip, TaskRow } from "./paperclip.ts";
import { waitsForApproval } from "./review-wait.ts";
import type { Limit, ReviewerLimits } from "./reviewer-limits.ts";

/**
 * The limit-aware review route (board, HAL-19203): a review task Liam or
 * Julian holds while they are parked on a pool wait or at a seat or usage
 * limit goes to the other reviewer at once, instead of waiting for the
 * review-wait note. Julian takes it only within his scope (HAL-14809), Liam
 * takes any but his own; when both are limited it stays, with one note per
 * head. Each head moves to each reviewer at most once, so a task can't bounce.
 */

/** What to do with a limited reviewer's task. */
export type RerouteChoice =
  | { readonly kind: "move"; readonly to: Reviewer }
  | { readonly kind: "stay"; readonly why: "author" | "outside julian" | "both limited" };

function otherOf(reviewer: Reviewer): Reviewer {
  return reviewer === "liam" ? "julian" : "liam";
}

function nameOf(reviewer: Reviewer): string {
  return reviewer === "liam" ? "Liam" : "Julian";
}

/**
 * Who takes over from the limited reviewer `held`: the other one, unless
 * they wrote the pull requests, or it's Julian and they are outside his
 * scope (Liam's own pull requests are always his), or they are limited too.
 */
export function rerouteChoice(
  held: Reviewer,
  author: string | undefined,
  inJulianScope: boolean,
  otherLimited: boolean,
): RerouteChoice {
  const other = otherOf(held);
  if (author === other) {
    return { kind: "stay", why: "author" };
  }
  if (other === "julian" && author !== "liam" && !inJulianScope) {
    return { kind: "stay", why: "outside julian" };
  }
  return otherLimited ? { kind: "stay", why: "both limited" } : { kind: "move", to: other };
}

/** The key of moving this head to `to`: once per head and reviewer. */
export function rerouteKey(pull: PullFacts, to: Reviewer): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} reroute ${to}`;
}

/** The key of the note that both reviewers are limited: once per head. */
export function bothLimitedKey(pull: PullFacts): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} both limited`;
}

function limitText(reviewer: Reviewer, limit: Limit): string {
  const what = limit.why === "pool wait" ? "parked on a pool wait" : "at a seat or usage limit";
  return `${nameOf(reviewer)} is ${what} since ${amsterdamTime(limit.since)}`;
}

function pullLines(pulls: readonly PullFacts[]): string[] {
  return pulls.map((pull) => `- [#${pull.number}](${pull.url}), head \`${short(pull.head)}\``);
}

/** The comment that moves the task to `to`. */
export function rerouteMessage(
  pulls: readonly PullFacts[],
  held: Reviewer,
  limit: Limit,
  to: Reviewer,
): string {
  return [
    `PR watcher: ${limitText(held, limit)}, so this review goes to ${nameOf(to)} now (HAL-19203):`,
    ...pullLines(pulls),
    ...pulls.map((pull) => marker(rerouteKey(pull, to))),
  ].join("\n");
}

/** The note when both reviewers are limited. */
export function bothLimitedMessage(
  pulls: readonly PullFacts[],
  held: Reviewer,
  limits: { readonly held: Limit; readonly other: Limit },
): string {
  return [
    `PR watcher: both reviewers are limited (${limitText(held, limits.held)}; ${limitText(otherOf(held), limits.other)}), so this review stays with ${nameOf(held)}:`,
    ...pullLines(pulls),
    ...pulls.map((pull) => marker(bothLimitedKey(pull))),
  ].join("\n");
}

/** What the reroute step needs from the pass. */
export interface RerouteOptions {
  readonly paperclip: Paperclip;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
  /** The reviewer by the path rules; without it, nothing moves. */
  readonly route?: ReviewerRoute | undefined;
  /** Whether a reviewer is limited now; without it, nothing moves. */
  readonly limits?: ReviewerLimits | undefined;
  /** Agents by the short name their branches start with. */
  readonly owners: ReadonlyMap<string, string>;
}

/** What the reroute step did on one task. */
export interface RerouteOutcome {
  readonly rerouted: boolean;
  readonly bothLimited: boolean;
}

/** The outcome for a task the step left alone. */
export const noReroute: RerouteOutcome = { rerouted: false, bothLimited: false };

function heldBy(task: TaskRow, owners: ReadonlyMap<string, string>): Reviewer | undefined {
  const reviewers: readonly Reviewer[] = ["liam", "julian"];
  return reviewers.find((reviewer) => owners.get(reviewer) === task.assigneeAgentId);
}

/** Every waiting pull request is Julian's or Nora's by its paths, so within his limits, and none is a security one. */
async function julianScope(route: ReviewerRoute, pulls: readonly PullFacts[]): Promise<boolean> {
  const reviews = await Promise.all(pulls.map(route));
  return reviews.every((review) => review.reviewer !== "liam" && !review.security);
}

/** What the step read: the held reviewer's limit, the other's state, and the choice. */
interface Situation {
  readonly held: Reviewer;
  readonly limit: Limit;
  readonly other: Limit | undefined;
  readonly choice: RerouteChoice;
}

async function situationOf(
  options: RerouteOptions,
  task: TaskRow,
  waiting: readonly PullFacts[],
): Promise<Situation | undefined> {
  const held = heldBy(task, options.owners);
  const otherId = held === undefined ? undefined : options.owners.get(otherOf(held));
  if (held === undefined || otherId === undefined || !options.limits || !options.route) {
    return undefined;
  }
  const limit = await options.limits(options.owners.get(held) ?? "");
  if (limit === undefined || limit === "unknown") {
    return undefined;
  }
  const other = await options.limits(otherId);
  if (other === "unknown") {
    options.log(
      `${task.identifier}: ${nameOf(held)} is limited, but ${nameOf(otherOf(held))}'s runs couldn't be read; left alone`,
    );
    return undefined;
  }
  const author = branchOwner(waiting[0]?.branch ?? "");
  const askJulian = otherOf(held) === "julian" && author !== "liam";
  const inScope = askJulian ? await julianScope(options.route, waiting) : true;
  return { held, limit, other, choice: rerouteChoice(held, author, inScope, other !== undefined) };
}

async function noteBothLimited(
  options: RerouteOptions,
  task: TaskRow,
  waiting: readonly PullFacts[],
  held: Reviewer,
  limits: { readonly held: Limit; readonly other: Limit },
  reported: ReadonlySet<string>,
): Promise<boolean> {
  const fresh = waiting.filter((pull) => !reported.has(bothLimitedKey(pull)));
  if (fresh.length === 0) {
    return false;
  }
  const body = bothLimitedMessage(fresh, held, limits);
  options.log(
    `${task.identifier}: both reviewers limited${options.dryRun ? " (dry run)" : ""}\n${body}`,
  );
  return options.dryRun || (await options.paperclip.note(task.id, body)) === "written";
}

/**
 * For a task Liam or Julian holds, not as its author, with no run working on
 * it and a pull request waiting for approval: moves it to the other reviewer
 * when its holder is limited and the other may take it, or notes once per
 * head that both are limited. The comments are read only when one applies.
 */
export async function rerouteStep(
  options: RerouteOptions,
  task: TaskRow,
  pulls: readonly PullFacts[],
): Promise<RerouteOutcome> {
  const waiting = pulls.filter(waitsForApproval);
  const situation = waiting.length === 0 ? undefined : await situationOf(options, task, waiting);
  if (situation === undefined || task.assigneeAgentId === null) {
    return noReroute;
  }
  const { held, choice, other } = situation;
  if (choice.kind === "stay" && choice.why !== "both limited") {
    options.log(`${task.identifier}: ${nameOf(held)} is limited, but it stays (${choice.why})`);
    return noReroute;
  }
  const reported = readMemory(
    await options.paperclip.comments(task.id),
    task.assigneeAgentId,
  ).reported;
  if (choice.kind === "stay") {
    const limits = other === undefined ? undefined : { held: situation.limit, other };
    const noted =
      limits !== undefined &&
      (await noteBothLimited(options, task, waiting, held, limits, reported));
    return { rerouted: false, bothLimited: noted };
  }
  const to = options.owners.get(choice.to);
  if (to === undefined || waiting.every((pull) => reported.has(rerouteKey(pull, choice.to)))) {
    return noReroute;
  }
  const body = rerouteMessage(waiting, held, situation.limit, choice.to);
  options.log(`${task.identifier}: to ${choice.to}${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return { rerouted: true, bothLimited: false };
  }
  const key = waiting.map((pull) => rerouteKey(pull, choice.to)).join(" | ");
  const change = { from: task.assigneeAgentId, to };
  const outcome = await options.paperclip.handOff(task.id, change, body, key, {
    overQueuedRun: true,
  });
  return { rerouted: outcome === "written", bothLimited: false };
}
