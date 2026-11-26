import { shippedCatalog as catalog } from "@halonicjs/action-catalog";
import { routesOf } from "@halonicjs/action-steppers";
import type { AnswerResult, InboxActionRequest, InboxAnswer } from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import { FakeActionRecords, FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import { acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import { allowsAcme } from "../test-support/acme-run.test-helper.ts";
import { StepperRun } from "./stepper-run.ts";

const definition = catalog.definition("github.change-branch-protection", 1);
if (definition === undefined) throw new Error("github.change-branch-protection@1 isn't shipped");
/** The routes the shell compiles for the shipped definition. */
const routes = routesOf(definition);

const at = new Date("2026-11-25T09:00:00.000Z");
const reviewsPath = "/repos/acme/app/branches/main/protection/required_pull_request_reviews";

/** Two required reviews on `main` of `acme/app`, from a requester who saw `expect`. */
function protectionRequest(expect?: InboxActionRequest["expect"]): InboxActionRequest {
  const request: InboxActionRequest = {
    definition: "github.change-branch-protection",
    version: 1,
    parameters: { owner: "acme", repo: "app", branch: "main", required_approving_review_count: 2 },
    expires: "2026-11-25T12:00:00.000Z",
  };
  if (expect !== undefined) request.expect = expect;
  return request;
}

/** A signed-in stepper for `request`, whose check reads `today` required reviews. */
async function runOf(request: InboxActionRequest, today: number) {
  const fake = new FakeActionSender({
    routes,
    answer: (call) =>
      call.method === "GET"
        ? { status: 200, fields: { required_approving_review_count: today } }
        : { status: 200, fields: { required_approving_review_count: 2 } },
    signInAs: { github: "acme-dev" },
    user: { confirms: true, secret: () => "" },
  });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => at });
  await fake.signIn("github");
  const answers: InboxAnswer[] = [];
  const answer = (sent: InboxAnswer): Promise<AnswerResult> => {
    answers.push(sent);
    return Promise.resolve({ outcome: "answered", answeredAt: at.toISOString() });
  };
  const item = actionItem(request);
  const options = { item, source: acmeSource, catalog, policy: allowsAcme, steps, answer };
  const open = async (): Promise<StepperRun> => {
    const review = reviewActionItem(item, acmeSource, { catalog, policy: allowsAcme, now: at });
    if (review.kind !== "stepper") throw new Error(`unreadable: ${review.reasons.join("; ")}`);
    const run = new StepperRun(review.view, { ...options, now: () => at });
    await run.open();
    return run;
  };
  return { fake, records, answers, open };
}

const methods = (sent: readonly { method: string }[]) => sent.map((call) => call.method);

verifies("action-steppers.expect-stop", () => {
  describe("a request's expect after its check step", () => {
    it("sends only the check, never the change, when the check read another state", async () => {
      const request = protectionRequest({ required_approving_review_count: 2 });
      const { fake, records, answers, open } = await runOf(request, 1);
      const run = await open();
      run.actions.runAll();
      await run.idle();
      expect(methods(fake.sent)).toEqual(["GET"]);
      expect(fake.sent[0]?.path).toBe(reviewsPath);
      expect(run.current().stage).toEqual({
        kind: "changed",
        message: 'This changed since the request: "required_approving_review_count".',
        changes: [{ name: "required_approving_review_count", expected: 2, current: 1 }],
      });
      expect(run.current().steps.map((step) => step.outcome.kind)).toEqual(["succeeded", "failed"]);
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "failed",
          steps: [
            {
              step: 1,
              outcome: "succeeded",
              status: 200,
              kept: { required_approving_review_count: 1 },
            },
            { step: 2, outcome: "failed", failure: "state-changed" },
          ],
        },
      ]);
      expect((await records.read("paperclip:acme/item-1")).at(-1)).toMatchObject({
        type: "action.finished",
        outcome: "failed",
      });
    });

    it("sends nothing more when step 2 is pressed on its own, or the request is opened again", async () => {
      const request = protectionRequest({ required_approving_review_count: 3 });
      const { fake, open } = await runOf(request, 1);
      const first = await open();
      first.actions.runStep(1);
      await first.idle();
      first.actions.runStep(2);
      await first.idle();
      const again = await open();
      again.actions.runStep(2);
      await again.idle();
      expect(methods(fake.sent)).toEqual(["GET"]);
      expect(again.current().stage.kind).toBe("changed");
    });

    it("sends both steps when the check reads what the requester saw", async () => {
      const request = protectionRequest({ required_approving_review_count: 1 });
      const { fake, answers, open } = await runOf(request, 1);
      const run = await open();
      run.actions.runAll();
      await run.idle();
      expect(methods(fake.sent)).toEqual(["GET", "PATCH"]);
      expect(fake.sent[1]).toMatchObject({
        path: reviewsPath,
        body: { required_approving_review_count: 2 },
      });
      expect(run.current().stage).toEqual({ kind: "finished" });
      expect(answers[0]).toMatchObject({ outcome: "succeeded" });
    });

    it("compares nothing when the request expects nothing", async () => {
      const { fake, open } = await runOf(protectionRequest(), 3);
      const run = await open();
      run.actions.runAll();
      await run.idle();
      expect(methods(fake.sent)).toEqual(["GET", "PATCH"]);
    });

    it("shows today's value next to the change once the check has read it", async () => {
      const request = protectionRequest({ required_approving_review_count: 1 });
      const { open } = await runOf(request, 1);
      const run = await open();
      expect(run.current().steps[1]?.preview).toBe(
        "Sets the required reviews on `main` in acme/app to 2.",
      );
      run.actions.runStep(1);
      await run.idle();
      expect(run.current().steps[1]?.preview).toBe(
        "Required reviews on `main` today: 1. After: 2.",
      );
    });
  });
});
