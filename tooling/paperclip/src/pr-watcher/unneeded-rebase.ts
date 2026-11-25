import { type Memory, marker, type PullFacts, short } from "./decide.ts";
import type { SinceApproval } from "./handoff.ts";

/**
 * A rebase nobody asked for (HAL-18722): rebases onto `main` were 19% of
 * the pushes after a pull request was ready and the costliest cause, a full
 * CI run each, and most re-approvals gave no reason for them. After an
 * approval, an author rebases only when the pull request conflicts or the
 * queue asks. The watcher notes on the task, once per head, a rebase-only
 * push after an approval with neither, and wakes nobody. Rules only, no
 * I/O, like `carry-over.ts`.
 */

/** The text the note starts with after the watcher's name. */
export const unneededText = "unneeded rebase after approval (no conflict, no queue request)";

/** One pull request rebased after its approval with no reason the watcher saw. */
export interface Unneeded {
  readonly pull: PullFacts;
  readonly since: SinceApproval;
}

/** The key of the note: once per head. */
export function unneededKey(pull: PullFacts): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} unneeded rebase`;
}

/** What the watcher reported on the approved head that asks for a new one. */
const askedOnHead = ["conflict", "retargeted", "held"] as const;

/** Two heads name the same commit when one starts with the other (7 or more characters each). */
function sameHead(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * The queue asked for a new head of the approved one: the watcher reported
 * a conflict, a base change or a held head on it, or the queue manager's
 * wake on the task names it (`Queue manager: #123 (head …)`).
 */
function asked(pull: PullFacts, approvedHead: string, memory: Memory): boolean {
  const at = `${pull.repo}#${pull.number} ${short(approvedHead)}`;
  if (askedOnHead.some((kind) => memory.reported.has(`${at} ${kind}`))) {
    return true;
  }
  return (memory.queueRequests ?? []).some(
    ({ number, head }) => number === pull.number && sameHead(head, approvedHead),
  );
}

/**
 * Only a rebase since the approval, with no conflict and no queue request on
 * the approved head, and not noted on this head yet. Never one the watcher
 * rebased itself off a merged base (`stack-rebase.ts`), nor a security pull
 * request, which isn't compared.
 */
export function unneeded(pull: PullFacts, since: SinceApproval, memory: Memory): boolean {
  if (!since.rebaseOnly || since.stacked === true || since.security === true) {
    return false;
  }
  return !memory.reported.has(unneededKey(pull)) && !asked(pull, since.approvedHead, memory);
}

/** The queue manager's wake line that names a pull request and its head. */
const queuePattern = /Queue manager: #(\d+) \(head `([0-9a-f]{7,40})`\)/g;

/** The pull requests and heads the queue manager's wakes in these comments name. */
export function queueRequestsOf(
  bodies: readonly string[],
): { readonly number: number; readonly head: string }[] {
  return bodies.flatMap((body) =>
    [...body.matchAll(queuePattern)].map((match) => ({
      number: Number(match[1]),
      head: match[2] ?? "",
    })),
  );
}

/** The task comment that notes the rebases and wakes nobody. */
export function unneededMessage(found: readonly Unneeded[]): string {
  const lines = found.map(
    ({ pull, since }) =>
      `- [#${pull.number}](${pull.url}): ${since.by} approved \`${short(since.approvedHead)}\`; \`${short(pull.head)}\` is the same change on a newer \`main\`.`,
  );
  return [
    `PR watcher: ${unneededText}.`,
    "",
    ...lines,
    "",
    "After an approval, rebase only when the pull request conflicts or the queue asks for it: each rebase costs a full CI run.",
    ...found.map(({ pull }) => marker(unneededKey(pull))),
  ].join("\n");
}
