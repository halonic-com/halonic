import { authorOf } from "./author.ts";
import { copyTaskOf } from "./branch.ts";
import {
  type GateVerdictPull,
  judgedGate,
  type RecordedGate,
  type RecordedSource,
  refusedGate,
  unreadGate,
} from "./gate.ts";
import { verdictsFor } from "./reader.ts";

/**
 * The reads behind the gate on the recorded verdicts (`gate.ts`, HAL-19969):
 * the author from `authorOf` on the pull request's task, then the records
 * through `verdictsFor`. Any read that fails counts as not approved.
 */

async function readGate(source: RecordedSource, pull: GateVerdictPull): Promise<RecordedGate> {
  if (pull.reviewer === undefined || pull.filesRead < pull.filesTotal) {
    return refusedGate(
      `only ${pull.filesRead} of its ${pull.filesTotal} changed files were read: the review rules can't be checked`,
    );
  }
  const task = pull.ownBranch ? copyTaskOf(pull.branch) : undefined;
  const [comments, agents] = await Promise.all([
    task === undefined ? Promise.resolve([]) : source.taskComments(task),
    source.agents(),
  ]);
  const found = authorOf({
    ...pull,
    pr: pull.number,
    teamLogin: source.teamLogin,
    agents,
    comments,
  });
  if ("refusal" in found) {
    return refusedGate(`who wrote it isn't clear: ${found.refusal}`);
  }
  const read = await verdictsFor(source.store, pull.repo, pull.number, {
    head: pull.head,
    author: found.author,
    reviewer: pull.reviewer,
    routineRefusal: pull.routineRefusal,
    fingerprint: pull.fingerprint,
  });
  return read.state === "read"
    ? judgedGate(read.verdicts, pull, found.author)
    : unreadGate(read.reason);
}

/**
 * The gate on the records for one pull request; a read that fails is not
 * approved, and is marked unread so a queued pull request isn't removed for it.
 */
export async function recordedGateOf(
  source: RecordedSource,
  pull: GateVerdictPull,
): Promise<RecordedGate> {
  try {
    return await readGate(source, pull);
  } catch (error) {
    return unreadGate(`the recorded verdicts couldn't be read: ${(error as Error).message}`);
  }
}
