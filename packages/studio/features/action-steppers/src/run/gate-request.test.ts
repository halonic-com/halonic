import type { AnswerResult, InboxActionRequest, InboxAnswer } from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import { FakeActionRecords, FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import { acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import {
  deploymentCatalog as catalog,
  deploymentRequest,
  deploymentRoutes,
  notWaiting,
  otherEnvironment,
} from "../test-support/acme-deployment.test-helper.ts";
import { allowsAcme } from "../test-support/acme-run.test-helper.ts";
import { StepperRun } from "./stepper-run.ts";

const at = new Date("2026-11-25T09:00:00.000Z");

/** What GitHub answers today: run 42 and the environment `release`. */
interface Today {
  readonly status?: string;
  readonly environmentId?: number;
}

/** A signed-in stepper for `request`, over a stand-in GitHub that answers as `today` says. */
async function runOf(request: InboxActionRequest, today: Today = {}) {
  const fake = new FakeActionSender({
    routes: deploymentRoutes,
    answer: (call) => {
      if (call.path.endsWith("/environments/release")) {
        return { status: 200, fields: { id: today.environmentId ?? 161, name: "release" } };
      }
      if (call.method === "GET") {
        return { status: 200, fields: { status: today.status ?? "waiting", head_sha: "abc123" } };
      }
      return { status: 200, fields: {} };
    },
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
  return { fake, answers, open };
}

const methods = (sent: readonly { method: string }[]) => sent.map((call) => call.method);
const outcomes = (answers: readonly InboxAnswer[]) =>
  answers.map((answer) => answer.kind === "action-result" && answer.outcome);

/** Runs every step it can, then opens the request again from its record alone. */
async function runAllAndReopen(open: () => Promise<StepperRun>) {
  const first = await open();
  first.actions.runAll();
  await first.idle();
  const again = await open();
  again.actions.runStep(3);
  await again.idle();
  return { first, again };
}

verifies("action-steppers.shell-gate-request", () => {
  describe("StepperRun with a check's requiredExpect and parameter rules", () => {
    it("sends the environment parameter as a one-item list, as Show the request shows it", async () => {
      const { fake, answers, open } = await runOf(deploymentRequest);
      const run = await open();
      const shown = run.current().steps[2]?.action;
      run.actions.runAll();
      await run.idle();

      expect(fake.sent.at(-1)).toEqual({
        service: "github",
        method: "POST",
        path: "/repos/acme/app/actions/runs/42/pending_deployments",
        body: { environment_ids: [161] },
      });
      expect(shown).toEqual({
        kind: "call",
        call: {
          method: "POST",
          address: "/repos/acme/app/actions/runs/42/pending_deployments",
          body: '{"environment_ids":[161]}',
        },
      });
      expect(outcomes(answers)).toEqual(["succeeded"]);
    });

    it("stops before the approval when the request doesn't say what the requester saw", async () => {
      const { definition, version, parameters, expires } = deploymentRequest;
      const unexpected = { definition, version, parameters, expires };
      const { fake, answers, open } = await runOf(unexpected);
      const { first, again } = await runAllAndReopen(open);

      const missing = 'This request doesn\'t say what the requester saw: "head_sha".';
      expect(methods(fake.sent)).toEqual(["GET"]);
      expect(first.current().stage).toEqual({ kind: "changed", message: missing, changes: [] });
      expect(again.current().stage).toEqual({ kind: "changed", message: missing, changes: [] });
      expect(outcomes(answers)).toEqual(["failed"]);
    });

    it("stops before the approval when the environment isn't the one the request names", async () => {
      const { fake, answers, open } = await runOf(deploymentRequest, { environmentId: 162 });
      const { first, again } = await runAllAndReopen(open);

      expect(methods(fake.sent)).toEqual(["GET", "GET"]);
      const stopped = { kind: "changed", message: otherEnvironment, changes: [] };
      expect(first.current().stage).toEqual(stopped);
      expect(first.current().steps[2]?.outcome).toEqual({
        kind: "failed",
        message: otherEnvironment,
      });
      expect(again.current().stage).toEqual(stopped);
      expect(outcomes(answers)).toEqual(["failed"]);
    });
  });
});

verifies("action-steppers.shell-check-gate", () => {
  describe("StepperRun with a deployment approval's fixed-value rule", () => {
    it("stops with the definition's reason when the run isn't waiting anymore", async () => {
      const { fake, open } = await runOf(deploymentRequest, { status: "approved" });
      const { first, again } = await runAllAndReopen(open);

      expect(methods(fake.sent)).toEqual(["GET"]);
      expect(first.current().stage).toEqual({ kind: "changed", message: notWaiting, changes: [] });
      expect(again.current().stage).toEqual({ kind: "changed", message: notWaiting, changes: [] });
    });
  });
});
