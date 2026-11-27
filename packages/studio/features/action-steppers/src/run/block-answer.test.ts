import { shippedCatalog as catalog } from "@halonicjs/action-catalog";
import { routesOf } from "@halonicjs/action-steppers";
import type { ActionResultAnswer, AnswerResult, InboxAnswer } from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import { FakeActionRecords, FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import { actionItemOf } from "../review/stepper-item.ts";
import { acmeSource } from "../test-support/acme-catalog.test-helper.ts";
import {
  allowsAcme,
  requestDocument,
  serverSessionItem,
} from "../test-support/acme-server-session.test-helper.ts";
import { answersPerBlock, blockAnswer } from "./block-answer.ts";
import { StepperRun } from "./stepper-run.ts";

const at = new Date("2026-11-25T10:00:00.000Z");

/** Upload a social preview image for the invented repository `acme/app`: one guided step. */
const uploadBlock = {
  kind: "use",
  ref: "github.upload-social-preview@1",
  parameters: { owner: "acme", repo: "app" },
};

const settings = "https://github.com/acme/app/settings";

/** A Paperclip card made 25 Nov 2026 at 09:00 UTC, pinning a request of the upload block alone. */
function uploadItem() {
  const read = actionItemOf(serverSessionItem(requestDocument([uploadBlock]), { kind: "action" }));
  if (read?.kind !== "action") throw new Error("an action item expected");
  return read;
}

/** The stored request opened as the Inbox opens it, answering through `answersPerBlock`. */
async function openUpload() {
  const definition = catalog.definition("github.upload-social-preview", 1);
  if (definition === undefined) throw new Error("github.upload-social-preview isn't shipped");
  const fake = new FakeActionSender({
    routes: routesOf(definition),
    answer: () => ({ status: 200, fields: {} }),
    signInAs: { github: "acme-dev" },
    user: { confirms: true, secret: () => "" },
  });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const steps = createActionSteps({ sender, records: new FakeActionRecords(), now: () => at });
  await fake.signIn("github");
  const sent: InboxAnswer[] = [];
  const answer = (chosen: InboxAnswer): Promise<AnswerResult> => {
    sent.push(chosen);
    return Promise.resolve({ outcome: "answered", answeredAt: at.toISOString() });
  };
  const { item, perBlock } = uploadItem();
  const review = reviewActionItem(item, acmeSource, { catalog, policy: allowsAcme, now: at });
  if (review.kind !== "stepper") throw new Error(`unreadable: ${review.reasons.join("; ")}`);
  const run = new StepperRun(review.view, {
    item,
    source: acmeSource,
    catalog,
    policy: allowsAcme,
    steps,
    answer: perBlock ? answersPerBlock(answer) : answer,
    now: () => at,
  });
  await run.open();
  return { fake, run, sent };
}

/** An answer that ended with `outcome` after `steps`. */
const answerOf = (
  outcome: ActionResultAnswer["outcome"],
  steps: ActionResultAnswer["steps"],
): ActionResultAnswer => ({ kind: "action-result", outcome, steps });

verifies("action-steppers.stepper-items", () => {
  describe("a stored request of one use block", () => {
    it("runs github.upload-social-preview@1 to the end and answers for its one block", async () => {
      const { fake, run, sent } = await openUpload();
      expect(run.current().stage).toEqual({ kind: "ready" });

      run.actions.openPage(settings);
      await run.idle();
      run.actions.confirmBrowserStep(1, undefined);
      await run.idle();

      expect(fake.opened).toEqual([settings]);
      expect(run.current().stage).toEqual({ kind: "finished" });
      // Block 1 of the request, which the Paperclip client writes as `stepper-result` row 1.
      expect(sent).toEqual([
        answerOf("succeeded", [{ step: 1, outcome: "succeeded", byHand: true }]),
      ]);
    });

    it("declines with no block listed", async () => {
      const { run, sent } = await openUpload();

      run.actions.decline();
      await run.idle();

      expect(sent).toEqual([answerOf("declined", [])]);
    });
  });

  describe("blockAnswer", () => {
    it("answers block 1 with every step's kept fields once every step succeeded", () => {
      const answer = answerOf("succeeded", [
        { step: 1, outcome: "succeeded", status: 201, kept: { name: "ACME_MODE" } },
        { step: 2, outcome: "skipped" },
        { step: 3, outcome: "succeeded", kept: { url: "https://github.com/acme/app" } },
      ]);

      expect(blockAnswer(answer)).toEqual(
        answerOf("succeeded", [
          {
            step: 1,
            outcome: "succeeded",
            kept: { name: "ACME_MODE", url: "https://github.com/acme/app" },
          },
        ]),
      );
    });

    it("fails block 1 as the first failed step did", () => {
      const failed = {
        step: 2,
        outcome: "failed",
        status: 403,
        failure: "refused",
        error: { untrusted: true, text: "Resource not accessible" },
      } as const;
      const answer = answerOf("failed", [{ step: 1, outcome: "succeeded" }, failed]);

      expect(blockAnswer(answer)).toEqual(answerOf("failed", [{ ...failed, step: 1 }]));
    });

    it("lists no block for a run stopped part-way, and keeps declined and expired as they are", () => {
      expect(blockAnswer(answerOf("failed", [{ step: 1, outcome: "succeeded" }]))).toEqual(
        answerOf("failed", []),
      );
      expect(blockAnswer(answerOf("failed", [{ step: 1, outcome: "skipped" }]))).toEqual(
        answerOf("failed", []),
      );
      expect(blockAnswer(answerOf("declined", []))).toEqual(answerOf("declined", []));
      expect(blockAnswer(answerOf("expired", []))).toEqual(answerOf("expired", []));
    });

    it("skips block 1 when every step was skipped", () => {
      const answer = answerOf("succeeded", [{ step: 1, outcome: "skipped" }]);

      expect(blockAnswer(answer)).toEqual(answerOf("succeeded", [{ step: 1, outcome: "skipped" }]));
    });
  });
});
