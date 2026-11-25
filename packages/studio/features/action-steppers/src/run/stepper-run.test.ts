import type { AnswerResult, InboxActionRequest, InboxAnswer } from "@halonicjs/ports";
import { createActionSteps, desktopOnlyActionSteps } from "@halonicjs/studio-services";
import {
  FakeActionRecords,
  FakeActionSender,
  type StandInAnswer,
  type StandInUser,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ActionItem, reviewActionItem } from "../review/action-item-review.ts";
import { acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import {
  acmeRunCatalog,
  acmeRunRoutes,
  allowsAcme,
  secretRequest,
  variableRequest,
} from "../test-support/acme-run.test-helper.ts";
import { StepperRun, type StepperRunOptions } from "./stepper-run.ts";

const request = "paperclip:acme/item-1";

/** What the user types in the shell's secret dialog: it must never show up anywhere else. */
export const typedSecret = "sentinel-value-never-leaves-the-shell";

const at = new Date("2026-11-25T09:00:00.000Z");

/** A run of `request` over the fake sender and records, signed in unless `signedIn` is false. */
export async function runOf(
  request: InboxActionRequest,
  setUp: { signedIn?: boolean; user?: StandInUser; service?: () => StandInAnswer } = {},
) {
  const fake = new FakeActionSender({
    routes: acmeRunRoutes,
    answer: setUp.service ?? (() => ({ status: 201, fields: { name: "ACME_MODE", value: "on" } })),
    signInAs: { github: "acme-dev" },
    user: setUp.user ?? { confirms: true, secret: () => typedSecret },
  });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => at });
  if (setUp.signedIn !== false) await fake.signIn("github");
  const answers: InboxAnswer[] = [];
  const answer = (sent: InboxAnswer): Promise<AnswerResult> => {
    answers.push(sent);
    return Promise.resolve({ outcome: "answered", answeredAt: at.toISOString() });
  };
  const item: ActionItem = actionItem(request);
  const options: StepperRunOptions = {
    item,
    source: acmeSource,
    catalog: acmeRunCatalog,
    policy: allowsAcme,
    steps,
    answer,
    now: () => at,
  };
  /** Opens the item as the Inbox does: reviews it, then reads its record and the sign-in. */
  const open = async (): Promise<StepperRun> => {
    const review = reviewActionItem(item, acmeSource, {
      catalog: acmeRunCatalog,
      policy: allowsAcme,
      now: at,
    });
    if (review.kind !== "stepper") throw new Error(`unreadable: ${review.reasons.join("; ")}`);
    const run = new StepperRun(review.view, options);
    await run.open();
    return run;
  };
  return { fake, records, steps, answers, options, open };
}

verifies("action-steppers.shell-run", () => {
  describe("StepperRun", () => {
    it("runs step 1 of an acme/app variable request as exactly that catalog step and records it", async () => {
      const { fake, records, open } = await runOf(variableRequest);
      const run = await open();
      expect(run.current().stage).toEqual({ kind: "ready" });
      expect(run.current().account).toBe("acme-dev");
      run.actions.runStep(1);
      await run.idle();
      expect(fake.sent).toEqual([
        {
          service: "github",
          method: "PATCH",
          path: "/repos/acme/app/actions/variables/ACME_MODE",
          body: { value: "on", visibility: "all" },
        },
      ]);
      expect((await records.read(request)).map((event) => event.type)).toEqual([
        "action.step.started",
        "action.step.succeeded",
      ]);
      expect(run.current().steps.map((step) => step.outcome.kind)).toEqual([
        "succeeded",
        "pending",
      ]);
    });

    it("resumes at the next step, opens a guided step's page and answers once every step is done", async () => {
      const { fake, answers, records, open } = await runOf(variableRequest);
      const first = await open();
      first.actions.runStep(1);
      await first.idle();
      // Opened again later: the record says step 1 is done.
      const run = await open();
      expect(run.current().steps.map((step) => step.outcome.kind)).toEqual([
        "succeeded",
        "pending",
      ]);
      run.actions.openPage("https://github.com/acme/app/settings/variables/actions");
      await run.idle();
      expect(fake.opened).toEqual(["https://github.com/acme/app/settings/variables/actions"]);
      expect(answers).toEqual([]);
      run.actions.confirmBrowserStep(2, undefined);
      await run.idle();
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "succeeded",
          steps: [
            { step: 1, outcome: "succeeded", status: 201, kept: { name: "ACME_MODE" } },
            { step: 2, outcome: "succeeded", byHand: true },
          ],
        },
      ]);
      expect((await records.read(request)).at(-1)).toMatchObject({
        type: "action.finished",
        outcome: "succeeded",
      });
      expect(run.current().stage).toEqual({ kind: "finished" });
    });

    it("answers a secret step with only the day it was set, never the typed value", async () => {
      const { answers, records, open } = await runOf(secretRequest);
      const run = await open();
      run.actions.runStep(1);
      await run.idle();
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "succeeded",
          steps: [
            { step: 1, outcome: "succeeded", status: 201, kept: { secret: "set on 25 Nov 2026" } },
          ],
        },
      ]);
      const answered = JSON.stringify(answers);
      expect(answered).toContain("set on");
      expect(answered).not.toContain('"value"');
      expect(answered).not.toContain(typedSecret);
      expect(JSON.stringify(await records.read(request))).not.toContain(typedSecret);
    });

    it("runs nothing of a request once it ended, even opened again", async () => {
      const { fake, answers, open } = await runOf(variableRequest);
      const run = await open();
      run.actions.decline();
      await run.idle();
      expect(answers).toEqual([{ kind: "action-result", outcome: "declined", steps: [] }]);
      const again = await open();
      expect(again.current().stage).toEqual({ kind: "declined" });
      again.actions.runStep(1);
      await again.idle();
      expect(fake.sent).toEqual([]);
      expect(answers).toHaveLength(1);
    });

    it("asks for a sign-in first, and runs nothing before it", async () => {
      const { fake, records, open } = await runOf(variableRequest, { signedIn: false });
      const run = await open();
      expect(run.current().stage).toEqual({
        kind: "sign-in",
        signIn: { service: "github", code: null },
      });
      run.actions.runStep(1);
      await run.idle();
      expect(fake.sent).toEqual([]);
      run.actions.signIn();
      await run.idle();
      expect(run.current().stage).toEqual({ kind: "ready" });
      expect((await records.read(request)).map((event) => event.type)).toEqual([
        "action.signed-in",
      ]);
    });

    it("keeps a step the user cancelled in the shell's dialog to do, and answers nothing", async () => {
      const cancelled = await runOf(secretRequest, {
        user: { confirms: false, secret: () => typedSecret },
      });
      const run = await cancelled.open();
      run.actions.runStep(1);
      await run.idle();
      expect(run.current().steps[0]?.outcome).toEqual({ kind: "pending" });
      expect(cancelled.answers).toEqual([]);
    });

    it("shows a failure with the service's message, and answers failed when the user stops there", async () => {
      const { answers, open } = await runOf(variableRequest, {
        service: () => ({ status: 403, error: "Resource not accessible" }),
      });
      const run = await open();
      run.actions.runStep(1);
      await run.idle();
      expect(run.current().steps[0]?.outcome).toEqual({
        kind: "failed",
        status: 403,
        message: "Resource not accessible",
      });
      run.actions.decline();
      await run.idle();
      expect(answers).toEqual([
        {
          kind: "action-result",
          outcome: "failed",
          steps: [
            {
              step: 1,
              outcome: "failed",
              failure: "service-error",
              status: 403,
              error: { untrusted: true, text: "Resource not accessible" },
            },
          ],
        },
      ]);
    });

    it("runs nothing outside the desktop app, where Decline still answers", async () => {
      const { options, answers, open } = await runOf(variableRequest);
      const reviewed = (await open()).current();
      const run = new StepperRun(
        { ...reviewed, stage: { kind: "desktop-only" } },
        { ...options, steps: desktopOnlyActionSteps },
      );
      await run.open();
      expect(run.current().stage).toEqual({ kind: "desktop-only" });
      run.actions.decline();
      await run.idle();
      expect(answers).toEqual([{ kind: "action-result", outcome: "declined", steps: [] }]);
      expect(run.current().stage).toEqual({ kind: "declined" });
    });

    it("says why when the source refuses the answer, and tries again", async () => {
      const { options, open } = await runOf(variableRequest);
      const reviewed = (await open()).current();
      let refuse = true;
      const run = new StepperRun(reviewed, {
        ...options,
        answer: () =>
          Promise.resolve(
            refuse
              ? { outcome: "refused", reason: "bad-answer" }
              : { outcome: "answered", answeredAt: "2026-11-25T09:00:00.000Z" },
          ),
      });
      await run.open();
      run.actions.decline();
      await run.idle();
      expect(run.failure).toEqual(new Error("The answer was refused: bad-answer"));
      refuse = false;
      run.retry();
      await run.idle();
      expect(run.failure).toBeUndefined();
      expect(run.current().stage).toEqual({ kind: "declined" });
    });
  });
});
