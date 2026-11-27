import { shippedCatalog as catalog } from "@halonicjs/action-catalog";
import { routesOf } from "@halonicjs/action-steppers";
import {
  type AnswerResult,
  checkActionResultAnswer,
  type InboxActionRequest,
  type InboxAnswer,
} from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import { FakeActionRecords, FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import { acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import { allowsAcme } from "../test-support/acme-run.test-helper.ts";
import { byHandMessage, noStartMessage, unchangedChecks } from "./changed-after-start.ts";
import { StepperRun } from "./stepper-run.ts";

const definition = catalog.definition("github.set-actions-secret", 1);
if (definition === undefined) throw new Error("github.set-actions-secret@1 isn't shipped");
/** The routes the shell compiles for the shipped definition. */
const routes = routesOf(definition);

const pageOpenedAt = new Date("2026-11-27T09:00:00.000Z");
const checkedAt = new Date("2026-11-27T09:05:00.000Z");
const secretsPage = "https://github.com/acme/app/settings/secrets/actions";

/** Set the secret `DEPLOY_TOKEN` on `acme/app`. */
const request: InboxActionRequest = {
  definition: "github.set-actions-secret",
  version: 1,
  parameters: { owner: "acme", repo: "app", name: "DEPLOY_TOKEN" },
  expires: "2026-11-27T12:00:00.000Z",
};

/**
 * A signed-in stepper for the secret, whose check reads `updatedAt()` from GitHub. Its answers go
 * through the provider's own check, which refuses one it wouldn't send on.
 */
async function runOf(updatedAt: () => string, expectations?: InboxActionRequest["expect"]) {
  let clock = pageOpenedAt;
  const fake = new FakeActionSender({
    routes,
    answer: () => ({ status: 200, fields: { name: "DEPLOY_TOKEN", updated_at: updatedAt() } }),
    signInAs: { github: "acme-dev" },
  });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => clock });
  await fake.signIn("github");
  const answers: InboxAnswer[] = [];
  const answer = (sent: InboxAnswer): Promise<AnswerResult> => {
    if (!checkActionResultAnswer(sent).ok) {
      return Promise.resolve({ outcome: "refused", reason: "bad-answer" });
    }
    answers.push(sent);
    return Promise.resolve({ outcome: "answered", answeredAt: clock.toISOString() });
  };
  const item = actionItem(
    expectations === undefined ? request : { ...request, expect: expectations },
  );
  /** Opens the request in a new stepper over the same record, as a later window does. */
  const open = async (): Promise<StepperRun> => {
    const review = reviewActionItem(item, acmeSource, { catalog, policy: allowsAcme, now: clock });
    if (review.kind !== "stepper") throw new Error(`unreadable: ${review.reasons.join("; ")}`);
    const opened = new StepperRun(review.view, {
      item,
      source: acmeSource,
      catalog,
      policy: allowsAcme,
      steps,
      answer,
      now: () => clock,
    });
    await opened.open();
    return opened;
  };
  const run = await open();
  /** Moves the clock on, as the user takes their time on GitHub's page. */
  const later = () => {
    clock = checkedAt;
  };
  return { fake, records, answers, run, later, open };
}

/** Opens GitHub's page at 09:00, says it's done, and runs the check at 09:05. */
async function saveAndCheck(run: StepperRun, later: () => void): Promise<void> {
  run.actions.openPage(secretsPage);
  await run.idle();
  later();
  run.actions.confirmBrowserStep(1, undefined);
  await run.idle();
  run.actions.runStep(2);
  await run.idle();
}

const outcomes = (run: StepperRun) => run.current().steps.map((step) => step.outcome);

verifies("action-steppers.changed-after-start-run", () => {
  describe("a secret's check after the guided step", () => {
    it("ends succeeded when GitHub saved the secret after the page opened", async () => {
      const { fake, answers, run, later } = await runOf(() => "2026-11-27T09:03:41Z");
      await saveAndCheck(run, later);
      expect(fake.opened).toEqual([secretsPage]);
      expect(run.current().stage).toEqual({ kind: "finished" });
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "succeeded",
          steps: [
            { step: 1, outcome: "succeeded", byHand: true },
            {
              step: 2,
              outcome: "succeeded",
              status: 200,
              kept: { name: "DEPLOY_TOKEN", updated_at: "2026-11-27T09:03:41Z" },
            },
          ],
        },
      ]);
    });

    it("doesn't end succeeded when the secret was last saved before the page opened", async () => {
      const { answers, run, later } = await runOf(() => "2026-11-26T18:30:05Z");
      await saveAndCheck(run, later);
      expect(answers).toEqual([]);
      expect(run.current().stage).toEqual({ kind: "ready" });
      expect(outcomes(run)).toEqual([
        { kind: "succeeded" },
        { kind: "failed", message: "It hasn't changed since this stepper opened." },
      ]);
    });

    it("answers the check as failed with state-changed when the user stops there", async () => {
      const { answers, records, run, later } = await runOf(() => "2026-11-26T18:30:05Z");
      await saveAndCheck(run, later);
      run.actions.decline();
      await run.idle();
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "failed",
          steps: [
            { step: 1, outcome: "succeeded", byHand: true },
            { step: 2, outcome: "failed", failure: "state-changed" },
          ],
        },
      ]);
      expect((await records.read("paperclip:acme/item-1")).at(-1)).toMatchObject({
        type: "action.finished",
        outcome: "failed",
      });
    });

    it("fails closed on a time that fits the pattern but isn't a real instant", async () => {
      const { answers, run, later } = await runOf(() => "2026-11-27T25:00:00Z");
      await saveAndCheck(run, later);
      expect(answers).toEqual([]);
      expect(outcomes(run)[1]).toEqual({
        kind: "failed",
        message: 'The service gave no valid time in "updated_at".',
      });
    });

    it("fails closed when the check runs before the stepper opened the page", async () => {
      const { fake, answers, run } = await runOf(() => "2026-11-27T09:03:41Z");
      run.actions.runStep(2);
      await run.idle();
      expect(fake.opened).toEqual([]);
      expect(answers).toEqual([]);
      expect(outcomes(run)[1]).toEqual({ kind: "failed", message: noStartMessage });
    });

    it("passes once the user saved it and checks again", async () => {
      let updatedAt = "2026-11-26T18:30:05Z";
      const { answers, run, later } = await runOf(() => updatedAt);
      await saveAndCheck(run, later);
      expect(answers).toEqual([]);
      updatedAt = "2026-11-27T09:04:10Z";
      run.actions.runStep(2);
      await run.idle();
      expect(run.current().stage).toEqual({ kind: "finished" });
      expect(answers[0]).toMatchObject({ outcome: "succeeded" });
    });

    it("answers once for the check when the expect stop and the judgement both name it", async () => {
      const { answers, run, later } = await runOf(() => "2026-11-26T18:30:05Z", {
        name: "OTHER_TOKEN",
      });
      await saveAndCheck(run, later);
      expect(run.failure).toBeUndefined();
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "failed",
          steps: [
            { step: 1, outcome: "succeeded", byHand: true },
            { step: 2, outcome: "failed", failure: "state-changed" },
          ],
        },
      ]);
    });

    it("doesn't count a check marked done by hand, and says to run it", async () => {
      const { answers, run, later } = await runOf(() => "2026-11-27T09:03:41Z");
      run.actions.openPage(secretsPage);
      await run.idle();
      later();
      run.actions.confirmBrowserStep(1, undefined);
      await run.idle();
      run.actions.markDoneByHand(2);
      await run.idle();
      expect(answers).toEqual([]);
      expect(outcomes(run)[1]).toEqual({ kind: "failed", message: byHandMessage });
      run.actions.runStep(2);
      await run.idle();
      expect(run.current().stage).toEqual({ kind: "finished" });
    });

    it("offers the page again when step 1 was marked done by hand without opening it", async () => {
      const { fake, answers, run, later } = await runOf(() => "2026-11-27T09:03:41Z");
      run.actions.markDoneByHand(1);
      await run.idle();
      run.actions.runStep(2);
      await run.idle();
      expect(outcomes(run)).toEqual([
        { kind: "pending" },
        { kind: "failed", message: noStartMessage },
      ]);
      await saveAndCheck(run, later);
      expect(fake.opened).toEqual([secretsPage]);
      expect(answers[0]).toMatchObject({ outcome: "succeeded" });
    });

    it("leaves step 1 as the record says once an expect stop ended the request", async () => {
      const { answers, run } = await runOf(() => "2026-11-27T09:03:41Z", { name: "OTHER_TOKEN" });
      run.actions.markDoneByHand(1);
      await run.idle();
      run.actions.runStep(2);
      await run.idle();
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "failed",
          steps: [
            { step: 1, outcome: "succeeded", byHand: true },
            { step: 2, outcome: "failed", failure: "state-changed" },
          ],
        },
      ]);
      expect(outcomes(run)[0]).toEqual({ kind: "succeeded" });
    });
  });
});

verifies("action-steppers.changed-after-start-run", () => {
  describe("a secret's check when the request is opened again", () => {
    it("still fails a time from before the page opened, and sends no answer", async () => {
      const { answers, run, later, open } = await runOf(() => "2026-11-26T18:30:05Z");
      await saveAndCheck(run, later);
      const again = await open();
      expect(answers).toEqual([]);
      expect(again.current().stage).toEqual({ kind: "ready" });
      expect(outcomes(again)).toEqual([
        { kind: "succeeded" },
        { kind: "failed", message: "It hasn't changed since this stepper opened." },
      ]);
    });

    it("shows step 1 to do again when it was marked done by hand without opening it", async () => {
      const { fake, answers, run, open } = await runOf(() => "2026-11-27T09:03:41Z");
      run.actions.markDoneByHand(1);
      await run.idle();
      run.actions.runStep(2);
      await run.idle();
      const again = await open();
      expect(fake.opened).toEqual([]);
      expect(answers).toEqual([]);
      expect(outcomes(again)).toEqual([
        { kind: "pending" },
        { kind: "failed", message: "Open the page from this stepper first, then check again." },
      ]);
    });

    it("offers that page only once the user has signed in to GitHub again", async () => {
      const { fake, answers, run, later, open } = await runOf(() => "2026-11-27T09:03:41Z");
      run.actions.markDoneByHand(1);
      await run.idle();
      run.actions.runStep(2);
      await run.idle();
      await fake.signOut("github");
      const again = await open();
      expect(again.current().stage.kind).toBe("sign-in");
      expect(outcomes(again)).toEqual([
        { kind: "succeeded" },
        { kind: "failed", message: "Open the page from this stepper first, then check again." },
      ]);
      again.actions.signIn();
      await again.idle();
      expect(again.current().stage).toEqual({ kind: "ready" });
      expect(outcomes(again)[0]).toEqual({ kind: "pending" });
      await saveAndCheck(again, later);
      expect(fake.opened).toEqual([secretsPage]);
      expect(answers[0]).toMatchObject({ outcome: "succeeded" });
    });
  });
});

verifies("action-steppers.changed-after-start-run", () => {
  describe("the start a check is judged against", () => {
    const at = (time: string) => `2026-11-27T${time}Z`;
    const base = { request: "paperclip:acme/item-1" };

    it("skips a page opening the shell refused, and keeps the first one that opened", () => {
      const check = unchangedChecks(definition, [
        { ...base, type: "action.step.started", at: at("08:00:00"), step: 1 },
        { ...base, type: "action.step.failed", at: at("08:00:00"), step: 1, failure: "refused" },
        { ...base, type: "action.step.started", at: at("09:00:00"), step: 1 },
        { ...base, type: "action.step.succeeded", at: at("09:04:00"), step: 1, kept: {} },
        { ...base, type: "action.step.started", at: at("09:05:00"), step: 2 },
        {
          ...base,
          type: "action.step.succeeded",
          at: at("09:05:00"),
          step: 2,
          status: 200,
          kept: { name: "DEPLOY_TOKEN", updated_at: at("08:30:00") },
        },
      ]);
      expect(check.get(2)).toEqual({
        message: "It hasn't changed since this stepper opened.",
        reopen: undefined,
      });
    });

    it("has no start, and offers the page again, when the shell refused its only opening", () => {
      const check = unchangedChecks(definition, [
        { ...base, type: "action.step.started", at: at("09:00:00"), step: 1 },
        { ...base, type: "action.step.failed", at: at("09:00:00"), step: 1, failure: "refused" },
        { ...base, type: "action.step.succeeded", at: at("09:04:00"), step: 1, kept: {} },
        { ...base, type: "action.step.started", at: at("09:05:00"), step: 2 },
        {
          ...base,
          type: "action.step.succeeded",
          at: at("09:05:00"),
          step: 2,
          status: 200,
          kept: { name: "DEPLOY_TOKEN", updated_at: at("09:03:00") },
        },
      ]);
      expect(check.get(2)).toEqual({
        message: "Open the page from this stepper first, then check again.",
        reopen: 1,
      });
    });
  });
});
