import type {
  AnswerResult,
  InboxAnswer,
  ServiceSignIn,
  SignInEnd,
  SignInRevoke,
} from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import {
  FakeActionRecords,
  FakeActionSender,
  FakeServiceSignIn,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import { acmeSource } from "../test-support/acme-catalog.test-helper.ts";
import { allowsAcme } from "../test-support/acme-run.test-helper.ts";
import {
  acmeApprovalPage,
  signInCatalog,
  signInItem,
  signInRequest,
} from "../test-support/acme-sign-in.test-helper.ts";
import { signInRunWords } from "./sign-in-run.ts";
import { StepperRun } from "./stepper-run.ts";

/** A run of the sign-in stepper over the stand-ins, with the clock at `at` until `later` moves it. */
function signInRunOf(
  setUp: {
    mode?: "connect" | "test";
    keys?: readonly string[];
    signIn?: (fake: FakeServiceSignIn) => ServiceSignIn;
    canSignIn?: boolean;
  } = {},
) {
  let now = new Date("2026-11-26T12:00:00.000Z");
  const fake = new FakeServiceSignIn({
    connections: {
      acme: { address: "https://paperclip.acme.example", company: "acme-company" },
    },
    keys: setUp.keys ?? [],
    approver: "Acme Board",
    now: () => now,
  });
  const sender = Object.assign(
    new FakeActionSender({
      routes: [],
      answer: () => ({ status: 200, fields: {} }),
      signInAs: {},
      user: { confirms: true, secret: () => "" },
    }),
    { cancelSignIn: () => Promise.resolve() },
  );
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => now });
  const opened: string[] = [];
  const answers: InboxAnswer[] = [];
  const answer = (sent: InboxAnswer): Promise<AnswerResult> => {
    answers.push(sent);
    return Promise.resolve({ outcome: "answered", answeredAt: now.toISOString() });
  };
  const item = signInItem(setUp.mode);
  const serviceSignIn = {
    signIn: setUp.signIn?.(fake) ?? fake,
    openPage: async (url: string) => void opened.push(url),
  };
  const open = async (): Promise<StepperRun> => {
    const review = reviewActionItem(item, acmeSource, {
      catalog: signInCatalog,
      policy: allowsAcme,
      now,
    });
    if (review.kind !== "stepper") throw new Error(review.reasons.join("; "));
    const run = new StepperRun(review.view, {
      item,
      source: acmeSource,
      catalog: signInCatalog,
      policy: allowsAcme,
      steps,
      answer,
      now: () => now,
      ...(setUp.canSignIn === false ? {} : { serviceSignIn }),
    });
    await run.open();
    return run;
  };
  const later = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { fake, records, opened, answers, open, later };
}

/** Runs step `number` from the run bar and waits for it. */
async function runStep(run: StepperRun, number: number): Promise<void> {
  run.actions.runStep(number);
  await run.idle();
}

/** Each step's outcome, as the screen shows it. */
function outcomes(run: StepperRun) {
  return run.current().steps.map((step) => step.outcome);
}

const tenMinutes = 10 * 60 * 1000;
const failed = (message: string) => ({ kind: "failed", message });

/** The fake, with some of its answers replaced. */
function scripted(answers: {
  follow?: SignInEnd;
  revoke?: SignInRevoke;
  nobody?: true;
}): (fake: FakeServiceSignIn) => ServiceSignIn {
  return (fake) => ({
    connection: (ref) => fake.connection(ref),
    start: (ref, options) => fake.start(ref, options),
    follow: (id, signal) =>
      answers.follow === undefined ? fake.follow(id, signal) : Promise.resolve(answers.follow),
    cancel: (id) => fake.cancel(id),
    whoAmI: (ref) => (answers.nobody ? Promise.resolve(undefined) : fake.whoAmI(ref)),
    revokeTest: (id) =>
      answers.revoke === undefined ? fake.revokeTest(id) : Promise.resolve(answers.revoke),
  });
}

verifies("action-steppers.paperclip-sign-in-run", () => {
  describe("a Paperclip sign-in stepper", () => {
    it("(a) shows the code and a 10-minute countdown after step 1, and stops when it expires", async () => {
      const { open, later } = signInRunOf();
      const run = await open();
      expect(run.current().stage).toEqual({ kind: "ready" });
      await runStep(run, 1);
      expect(run.current().serviceSignIn).toEqual({
        code: "acme-code-1",
        expiresAt: new Date("2026-11-26T12:10:00.000Z"),
        kept: false,
        account: null,
      });
      later(tenMinutes);
      await runStep(run, 2);
      expect(outcomes(run)[1]).toEqual(failed(signInRunWords.expired));
      expect(signInRunWords.expired).toBe("The sign-in expired.");
      expect(run.current().serviceSignIn).toBeUndefined();
      // It starts again at its first step.
      expect(outcomes(run)[0]).toEqual({ kind: "pending" });
    });

    it("(a) stops with the sign-in expired when the wait for approval runs out", async () => {
      const { open, fake } = signInRunOf();
      const run = await open();
      await runStep(run, 1);
      await runStep(run, 2);
      run.actions.runStep(3);
      fake.expire("sign-in-1");
      await run.idle();
      expect(outcomes(run)[2]).toEqual(failed(signInRunWords.expired));
    });

    it("(b) cancels the wait and keeps no key when the stepper closes during step 3", async () => {
      const { open, fake, records } = signInRunOf();
      const run = await open();
      await runStep(run, 1);
      await runStep(run, 2);
      run.actions.runStep(3);
      fake.approve("sign-in-1");
      await run.close();
      await run.idle();
      expect(fake.keychain.size).toBe(0);
      expect(outcomes(run)[2]).toEqual(failed(signInRunWords.cancelled));
      expect(await records.read(signInRequest)).toEqual([]);
    });

    it("(b) cancels a started sign-in when the stepper closes before step 3", async () => {
      const { open, fake } = signInRunOf();
      const run = await open();
      await runStep(run, 1);
      await run.close();
      expect(await fake.follow("sign-in-1", new AbortController().signal)).toEqual({
        outcome: "cancelled",
      });
    });

    it("(c) opens exactly the approval page the sign-in started on the connection's host", async () => {
      const { open, opened } = signInRunOf();
      const run = await open();
      await runStep(run, 1);
      await runStep(run, 2);
      expect(opened).toEqual([acmeApprovalPage]);
      expect(outcomes(run)[1]).toEqual({ kind: "succeeded", result: undefined });
    });

    it("(d) keeps the key, says who signed in, revokes the test key and answers the request", async () => {
      const { open, fake, records, answers } = signInRunOf();
      const run = await open();
      await runStep(run, 1);
      await runStep(run, 2);
      run.actions.runStep(3);
      fake.approve("sign-in-1");
      await run.idle();
      expect(fake.keychain.has("acme")).toBe(true);
      expect(outcomes(run)[2]).toEqual({ kind: "succeeded", result: "Signed in as Acme Board." });
      expect(run.current().serviceSignIn?.kept).toBe(true);
      await runStep(run, 4);
      expect(fake.keychain.size).toBe(0);
      const types = (await records.read(signInRequest)).map((event) => event.type);
      expect(types).toEqual([
        "action.step.succeeded",
        "action.step.succeeded",
        "action.step.succeeded",
        "action.step.succeeded",
        "action.finished",
      ]);
      expect(answers).toHaveLength(1);
      expect(run.current().stage).toEqual({ kind: "finished" });
      expect(outcomes(run)[3]).toEqual({
        kind: "succeeded",
        result: `Signed in as Acme Board. ${signInRunWords.revoked}`,
      });
      expect(run.current().serviceSignIn).toBeUndefined();
    });

    it("keeps the key of a sign-in that isn't a test, and only says who it is", async () => {
      const { open, fake } = signInRunOf({ mode: "connect" });
      const run = await open();
      await runStep(run, 1);
      await runStep(run, 2);
      run.actions.runStep(3);
      fake.approve("sign-in-1");
      await run.idle();
      await runStep(run, 4);
      expect(fake.keychain.has("acme")).toBe(true);
      expect(outcomes(run)[3]).toEqual({ kind: "succeeded", result: "Signed in as Acme Board." });
    });

    it("shows the parts recorded in an earlier window as done when opened again", async () => {
      const { open, fake } = signInRunOf({ mode: "connect" });
      const first = await open();
      await runStep(first, 1);
      await runStep(first, 2);
      first.actions.runStep(3);
      fake.approve("sign-in-1");
      await first.idle();
      // Closing once the key is kept leaves it: only a test sign-in revokes its key.
      await first.close();
      expect(fake.keychain.has("acme")).toBe(true);
      const again = await open();
      expect(outcomes(again).map((outcome) => outcome.kind)).toEqual([
        "succeeded",
        "succeeded",
        "succeeded",
        "pending",
      ]);
      await runStep(again, 4);
      expect(outcomes(again)[3]).toEqual({ kind: "succeeded", result: "Signed in as Acme Board." });
    });

    it("sends a test key made in an earlier window to Settings to disconnect", async () => {
      const { open, fake } = signInRunOf();
      const first = await open();
      await runStep(first, 1);
      await runStep(first, 2);
      first.actions.runStep(3);
      fake.approve("sign-in-1");
      await first.idle();
      const again = await open();
      await runStep(again, 4);
      expect(outcomes(again)[3]).toEqual(failed(signInRunWords.revokeLeft["not-a-test"]));
    });

    it("refuses a test sign-in on a connection that is already signed in", async () => {
      const { open, fake } = signInRunOf({ keys: ["acme"] });
      const run = await open();
      await runStep(run, 1);
      expect(outcomes(run)[0]).toEqual(failed(signInRunWords["already-signed-in"]));
      expect(fake.started).toBe(0);
    });

    it("asks to start again when a later part runs with no sign-in in this window", async () => {
      const { open } = signInRunOf();
      const run = await open();
      await runStep(run, 2);
      expect(outcomes(run)[1]).toEqual(failed(signInRunWords.startAgain));
      await runStep(run, 3);
      expect(outcomes(run)[2]).toEqual(failed(signInRunWords.startAgain));
    });

    it("says why the wait ended without a key", async () => {
      for (const [end, words] of [
        [{ outcome: "wrong-company" }, signInRunWords.wrongCompany],
        [{ outcome: "expired" }, signInRunWords.expired],
      ] as const) {
        const { open } = signInRunOf({ signIn: scripted({ follow: end }) });
        const run = await open();
        await runStep(run, 1);
        await runStep(run, 2);
        await runStep(run, 3);
        expect(outcomes(run)[2]).toEqual(failed(words));
      }
    });

    it("says when Paperclip refuses the key or the test key may still work", async () => {
      const cases = [
        [{ nobody: true }, signInRunWords.notSignedIn],
        [{ revoke: { outcome: "still-works" } }, signInRunWords.revokeLeft["still-works"]],
        [{ revoke: { outcome: "unreachable" } }, signInRunWords.revokeLeft.unreachable],
      ] as const;
      for (const [answers, words] of cases) {
        const { open, fake } = signInRunOf({ signIn: scripted(answers) });
        const run = await open();
        await runStep(run, 1);
        await runStep(run, 2);
        run.actions.runStep(3);
        fake.approve("sign-in-1");
        await run.idle();
        await runStep(run, 4);
        expect(outcomes(run)[3]).toEqual(failed(words));
      }
    });

    it("can't run where this Studio has no sign-in for steppers", async () => {
      const { open } = signInRunOf({ canSignIn: false });
      const run = await open();
      expect(run.current().stage).toEqual({ kind: "not-available" });
      await runStep(run, 1);
      expect(outcomes(run)[0]).toEqual({ kind: "pending" });
    });
  });
});
