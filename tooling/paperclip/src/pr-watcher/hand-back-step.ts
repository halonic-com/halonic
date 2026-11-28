import { type CloseGuards, guardDone } from "./close-guards.ts";
import { branchesOwner, type Decision, decide, type PullFacts } from "./decide.ts";
import { type HandBack, handBackMessage, handBackOf, reviewerName } from "./hand-back.ts";
import { readMemory } from "./memory.ts";
import { doneMessage } from "./messages.ts";
import type { Paperclip, TaskRow } from "./paperclip.ts";

/** What the hand-back step needs from the pass. */
export interface HandBackOptions {
  readonly paperclip: Paperclip;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
  readonly now: Date;
  readonly closeGuards?: CloseGuards;
  readonly acted?: (task: TaskRow, decision: Decision) => void;
}

/** What the step did: closed the task, gave it back to its author, or nothing. */
export type HandBackStep = "done" | "handed" | "none";

/**
 * For a task its reviewer holds with no run going (`pulls` are its pull
 * requests' facts, empty for any other task): once they all landed, done by
 * the author's rules; else back to the author with `todo` after the holder's
 * verdict on the head or a head the queue holds (HAL-21150). A parked task
 * is only closed: its holder put it aside on purpose.
 */
export async function handBackStep(
  options: HandBackOptions,
  task: TaskRow,
  pulls: readonly PullFacts[],
  owners: ReadonlyMap<string, string>,
): Promise<HandBackStep> {
  const who = partiesOf(task, pulls, owners);
  const back = who === undefined ? undefined : handBackOf(reviewerName(who.holderKey), pulls);
  if (who === undefined || back === undefined) {
    return "none";
  }
  if (back.why === "merged") {
    const done = await doneAsAuthor(options, task, who.author, pulls);
    if (done !== undefined) {
      return closeTask(options, task, done);
    }
  }
  return task.parked === true ? "none" : giveBack(options, task, who, back);
}

/** The reviewer who holds the task and the author its branches name, by short name and id. */
interface Parties {
  readonly holderKey: string;
  readonly holder: string;
  readonly authorKey: string;
  readonly author: string;
}

function partiesOf(
  task: TaskRow,
  pulls: readonly PullFacts[],
  owners: ReadonlyMap<string, string>,
): Parties | undefined {
  const holder = [...owners].find(([, id]) => id === task.assigneeAgentId);
  const authorKey = branchesOwner(pulls.map((pull) => pull.branch));
  const author = authorKey === undefined ? undefined : owners.get(authorKey);
  if (holder === undefined || authorKey === undefined || author === undefined) {
    return undefined;
  }
  return { holderKey: holder[0], holder: holder[1], authorKey, author };
}

/** Gives the task to its author with `todo`, waking them, with the hand-back comment. */
async function giveBack(
  options: HandBackOptions,
  task: TaskRow,
  who: Parties,
  back: HandBack,
): Promise<HandBackStep> {
  const body = handBackMessage(reviewerName(who.authorKey), back);
  options.log(
    `${task.identifier}: back to ${who.authorKey}${options.dryRun ? " (dry run)" : ""}\n${body}`,
  );
  if (options.dryRun) {
    return "handed";
  }
  const change = { from: who.holder, to: who.author };
  const outcome = await options.paperclip.handOff(task.id, change, body, back.key);
  return outcome === "written" ? "handed" : "none";
}

/** The done the watcher would write if the author held the task; undefined when the author's rules keep it open. */
async function doneAsAuthor(
  options: HandBackOptions,
  task: TaskRow,
  author: string,
  pulls: readonly PullFacts[],
) {
  const asAuthor = { ...task, assigneeAgentId: author };
  const memory = readMemory(await options.paperclip.comments(task.id), author);
  const guards = { guards: options.closeGuards, now: options.now };
  const decision = await guardDone(
    asAuthor,
    decide(asAuthor, author, pulls, memory),
    memory,
    guards,
  );
  return decision.kind === "done" ? decision : undefined;
}

async function closeTask(
  options: HandBackOptions,
  task: TaskRow,
  decision: Extract<Decision, { kind: "done" }>,
): Promise<HandBackStep> {
  const body = doneMessage(decision.pulls);
  options.log(`${task.identifier}: done${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return "done";
  }
  if ((await options.paperclip.markDone(task.id, body)) === "closed") {
    return "none";
  }
  options.acted?.(task, decision);
  return "done";
}
