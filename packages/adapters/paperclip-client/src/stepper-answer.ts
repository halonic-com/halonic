import {
  type ActionResultAnswer,
  type AnswerResult,
  checkActionResultAnswer,
  type MessagingRefusal,
} from "@halonicjs/ports";
import { asRecord, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";
import { renderStepperResult } from "./stepper-result.ts";
import { type PaperclipSteppers, pinnedRevision } from "./steppers.ts";
import { type PaperclipAnswer, PaperclipClientError } from "./transport.ts";

/** What answering a stepper card needs from the writer. */
export interface StepperAnswerContext {
  reader: PaperclipReader;
  steppers: PaperclipSteppers;
  now: () => Date;
}

/** The port's refusal for a failed write, or `undefined` when the port has no word for it. */
function refusalOf(answer: PaperclipAnswer): MessagingRefusal | undefined {
  if (answer.kind === "ok") return undefined;
  const { failure } = answer;
  return failure === "offline" || failure === "signed-out" || failure === "not-found"
    ? failure
    : undefined;
}

/** The refusal for a failed step, or a thrown error for a failure the port has no word for. */
function stopped(name: string, answer: PaperclipAnswer): AnswerResult | undefined {
  if (answer.kind === "ok") return undefined;
  const reason = refusalOf(answer);
  if (reason === undefined) throw new PaperclipClientError(`Paperclip refused ${name}.`, "refused");
  return { outcome: "refused", reason };
}

/**
 * Gives Studio's `action-result` to an open stepper card (architecture note
 * on HAL-17491, 7.4): writes the document `stepper-result` on the card's
 * task, posts one summary comment, and resolves the card, accepted when the
 * stepper succeeded and rejected otherwise, so the agent wakes either way.
 * An answer that fails its allow-list, a card that pins no request, or a
 * step past the request's last block is refused with `bad-answer` before
 * anything is written.
 */
export async function answerStepperCard(
  context: StepperAnswerContext,
  ids: { task: string; card: string },
  record: JsonRecord,
  answer: ActionResultAnswer,
): Promise<AnswerResult> {
  const { task, card } = ids;
  const revision = pinnedRevision(record);
  if (!checkActionResultAnswer(answer).ok || revision === undefined) {
    return { outcome: "refused", reason: "bad-answer" };
  }
  const pinned = await context.steppers.read(task, revision);
  const blocks = pinned.kind === "readable" ? pinned.validated.request.blocks.length : 0;
  if (pinned.kind !== "readable" || answer.steps.some((step) => step.step > blocks)) {
    return { outcome: "refused", reason: "bad-answer" };
  }
  const at = context.now();
  const result = renderStepperResult({
    request: pinned.validated.request,
    revision,
    answer,
    catalog: context.steppers.catalog,
    at,
  });
  const written = await context.steppers.writeResult(task, result.document);
  const notWritten = stopped("writeStepperResult", written);
  if (notWritten !== undefined) return notWritten;
  const commented = await context.reader.send("commentOnChat", {
    path: { task },
    body: { body: result.summary, clientRequestId: crypto.randomUUID() },
  });
  const notCommented = stopped("commentOnChat", commented);
  if (notCommented !== undefined) return notCommented;
  const resolved = await context.reader.send(
    answer.outcome === "succeeded" ? "acceptCard" : "rejectCard",
    {
      path: { task, card },
      body:
        answer.outcome === "succeeded"
          ? {}
          : {
              reason: `The stepper ${answer.outcome} in Halonic; see the document stepper-result.`,
            },
    },
  );
  // Paperclip expires a card whose request changed; the result and the comment are written all the same.
  if (resolved.kind === "failed" && resolved.failure === "conflict") {
    return { outcome: "answered", answeredAt: at.toISOString() };
  }
  const notResolved = stopped("resolveCard", resolved);
  if (notResolved !== undefined) return notResolved;
  const resolvedAt =
    resolved.kind === "ok" ? text(asRecord(resolved.body), "resolvedAt") : undefined;
  return { outcome: "answered", answeredAt: resolvedAt ?? at.toISOString() };
}
