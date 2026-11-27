import { personFor } from "../routing.ts";
import { gateRow } from "./gate.ts";
import type { GatePull, MergeSnapshot } from "./snapshot.ts";
import type { MergeSettings } from "./state.ts";

/**
 * The reviewer asks (HAL-20636): an approved, green pull request that waits
 * only for a reviewer who has nothing to wake them. Two kinds: Julian's
 * security sign-off (the gate's `security PR (…): waiting for …` reason), and
 * Liam's approval after Nora's, while Nora is in shadow (the live Merger
 * doesn't count her approval yet) or outside her scope. Each ask gets one
 * review task per pull request and reviewer; the task closes when the ask
 * is gone or the pull request is. The reviewer is the agent the routing
 * names for the role (`personFor`, HAL-19639), never a name of our own.
 */

/** The two asks: Julian's security sign-off, Liam's approval after Nora's. */
export type AskKind = "security-signoff" | "liam-after-nora";

/** One pull request waiting on one reviewer. */
export interface ReviewerAsk {
  readonly kind: AskKind;
  /** The reviewer's agent url key, such as `julian`. */
  readonly reviewer: string;
  readonly pull: Pick<GatePull, "number" | "head" | "branch" | "title">;
  /** The gate's reason, or what the live Merger waits for. */
  readonly reason: string;
  /** Nothing else holds it: green, mergeable, on `main`, out of draft and not queued. */
  readonly due: boolean;
}

/** The roles each ask goes to (`routing.ts`). */
const askRoles: Readonly<Record<AskKind, string>> = {
  "security-signoff": "second-reviewer",
  "liam-after-nora": "code-reviewer",
};

const securityWait =
  /^security PR \(.+\): waiting for ("Julian: security sign-off|Julian's recorded security-ok)/;
const noraNeedsLiam = /^Nora approved, but it is outside her scope \(.+\): needs Liam$/;
const noLiamApproval = /^no approval from Liam found for head /;

function askOf(reason: string): AskKind | undefined {
  if (securityWait.test(reason)) {
    return "security-signoff";
  }
  return noraNeedsLiam.test(reason) ? "liam-after-nora" : undefined;
}

/**
 * Every pull request's open asks, with whether each is due. `noraShadow`:
 * Nora's approval alone still needs Liam's (the board's switch).
 */
export function reviewerAsksOf(
  snapshot: MergeSnapshot,
  settings: MergeSettings,
  noraShadow: boolean,
): ReviewerAsk[] {
  const asks: ReviewerAsk[] = [];
  for (const pull of snapshot.pulls) {
    const row = gateRow(snapshot, pull, settings);
    const kinds = new Map<AskKind, string>();
    const others: string[] = [];
    for (const reason of row.reasons) {
      const kind = askOf(reason);
      if (kind === undefined) {
        others.push(reason);
      } else {
        kinds.set(kind, reason);
      }
    }
    if (noraShadow && row.approval?.ok === true && row.approval.nora === true) {
      kinds.set(
        "liam-after-nora",
        `Nora approved head ${pull.head.slice(0, 9)}; while she is in shadow the Merger still needs Liam's signed approval`,
      );
    }
    // Outside her scope, the gate also says it found no approval from Liam:
    // that is the same ask, not something else holding it (HAL-20645).
    const holding = kinds.has("liam-after-nora")
      ? others.filter((reason) => !noLiamApproval.test(reason))
      : others;
    const due =
      holding.length === 0 &&
      !pull.draft &&
      row.entry === undefined &&
      pull.mergeable === "MERGEABLE";
    for (const [kind, reason] of kinds) {
      const reviewer = personFor(askRoles[kind], undefined);
      asks.push({ kind, reviewer, pull, reason, due });
    }
  }
  return asks;
}

/** A review task the pass keeps, by `<number>:<reviewer>`; `task` is "" when none could be made for this head. */
export interface ReviewerTaskEntry {
  readonly task: string;
  readonly kind: AskKind;
  readonly head: string;
}

export type ReviewerTasks = Readonly<Record<string, ReviewerTaskEntry>>;

/** What a pass does with the review tasks. */
export type ReviewerTaskStep =
  | { readonly kind: "create"; readonly key: string; readonly ask: ReviewerAsk }
  | {
      readonly kind: "new-head";
      readonly key: string;
      readonly ask: ReviewerAsk;
      readonly task: string;
    }
  | { readonly kind: "close"; readonly key: string; readonly task: string; readonly why: string };

export function askKey(ask: Pick<ReviewerAsk, "pull" | "reviewer">): string {
  return `${ask.pull.number}:${ask.reviewer}`;
}

const resolved: Readonly<Record<AskKind, string>> = {
  "security-signoff": "Julian's security sign-off is on the head, or it is no longer a security PR",
  "liam-after-nora":
    "it no longer waits for Liam after Nora: his approval is on the head, or hers no longer counts",
};

/**
 * The steps for this pass: a task for each due ask without one, a new-head
 * note on a task whose ask moved to a new head, and a close for each task
 * whose pull request was read without its ask, or is no longer open. With
 * the open list unread, nothing is closed for that.
 */
export function reviewerTaskSteps(
  asks: readonly ReviewerAsk[],
  tasks: ReviewerTasks,
  snapshot: Pick<MergeSnapshot, "pulls" | "open">,
): ReviewerTaskStep[] {
  return [...askSteps(asks, tasks), ...closeSteps(asks, tasks, snapshot)];
}

/** A task for each due ask without one, a new-head note where its head moved. */
function askSteps(asks: readonly ReviewerAsk[], tasks: ReviewerTasks): ReviewerTaskStep[] {
  const steps: ReviewerTaskStep[] = [];
  for (const ask of asks) {
    const key = askKey(ask);
    const entry = tasks[key];
    if (!ask.due || entry?.head === ask.pull.head) {
      continue;
    }
    if (entry === undefined || entry.task === "") {
      steps.push({ kind: "create", key, ask });
    } else {
      steps.push({ kind: "new-head", key, ask, task: entry.task });
    }
  }
  return steps;
}

/** A close for each task whose ask is gone, or whose pull request is no longer open. */
function closeSteps(
  asks: readonly ReviewerAsk[],
  tasks: ReviewerTasks,
  snapshot: Pick<MergeSnapshot, "pulls" | "open">,
): ReviewerTaskStep[] {
  if (snapshot.open === null) {
    return [];
  }
  const steps: ReviewerTaskStep[] = [];
  const pending = new Set(asks.map(askKey));
  const read = new Set(snapshot.pulls.map((pull) => pull.number));
  const open = new Set(snapshot.open.map((pull) => pull.number));
  for (const [key, entry] of Object.entries(tasks)) {
    const number = Number(key.split(":")[0]);
    if (pending.has(key)) {
      continue;
    }
    if (!open.has(number)) {
      steps.push({ kind: "close", key, task: entry.task, why: "the PR was merged or closed" });
    } else if (read.has(number)) {
      steps.push({ kind: "close", key, task: entry.task, why: resolved[entry.kind] });
    }
  }
  return steps;
}
