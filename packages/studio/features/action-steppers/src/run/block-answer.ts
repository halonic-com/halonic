/**
 * Turns the answer of a run, numbered by the definition's steps, into the answer of the stored
 * stepper request it ran: one `use` block, numbered 1 (`action-steppers.stepper-items`). The
 * Paperclip client writes the block's `stepper-result` from it.
 */
import type {
  ActionResultAnswer,
  ActionResultStep,
  AnswerResult,
  InboxAnswer,
} from "@halonicjs/ports";

/** The block's number: a request that runs here is exactly one `use` block. */
const onlyBlock = 1;

/**
 * The run's answer as the answer for its one block. Declined and expired answers list no steps,
 * so they stay as they are. Otherwise the block failed as its first failed step did, or, when a
 * step ran and none failed, it succeeded with every step's kept fields, "done by hand" when the
 * user did any step by hand, or skipped when every step was skipped. A run the user stopped
 * part-way, with no failed step, lists no block: the port has no failure for "stopped".
 *
 * @example
 * blockAnswer({ kind: "action-result", outcome: "succeeded", steps: [{ step: 1, outcome: "succeeded", byHand: true }] });
 * // => { kind: "action-result", outcome: "succeeded", steps: [{ step: 1, outcome: "succeeded", byHand: true }] }
 */
export function blockAnswer(answer: ActionResultAnswer): ActionResultAnswer {
  const block = blockStep(answer);
  return { ...answer, steps: block === undefined ? [] : [block] };
}

/**
 * `answer` for a stored stepper request: an `action-result` goes as {@link blockAnswer}, so the
 * agent's result names the block it asked for; any other answer goes as it is.
 *
 * @example
 * const answer = answersPerBlock((sent) => messaging.answer(item.source, item.id, sent));
 */
export function answersPerBlock(
  answer: (answer: InboxAnswer) => Promise<AnswerResult>,
): (answer: InboxAnswer) => Promise<AnswerResult> {
  return (sent) => answer(sent.kind === "action-result" ? blockAnswer(sent) : sent);
}

function blockStep(answer: ActionResultAnswer): ActionResultStep | undefined {
  const { outcome, steps } = answer;
  if (steps.length === 0) return undefined;
  const failed = steps.find((step) => step.outcome === "failed");
  if (failed !== undefined) return { ...failed, step: onlyBlock };
  const done = steps.filter((step) => step.outcome === "succeeded");
  if (done.length === 0) return { step: onlyBlock, outcome: "skipped" };
  if (outcome !== "succeeded") return undefined;
  return succeededBlock(done);
}

function succeededBlock(done: readonly ActionResultStep[]): ActionResultStep {
  const block: ActionResultStep = { step: onlyBlock, outcome: "succeeded" };
  // Each step keeps its own fields; a later step's field of the same name is the newer value.
  const kept = Object.assign({}, ...done.map((step) => step.kept ?? {}));
  if (Object.keys(kept).length > 0) block.kept = kept;
  if (done.some((step) => step.byHand === true)) block.byHand = true;
  return block;
}
