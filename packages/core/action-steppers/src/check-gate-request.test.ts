import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkStepGate } from "./check-gate.ts";
import { routesOf } from "./step-routes.ts";
import type { CallStep, CheckStep, StepperDefinition } from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";

const deploymentsPage = {
  url: "https://github.com/{owner}/{repo}/actions/runs/{run_id}",
  instructions: ["Open Review deployments."],
};

const readRun: CheckStep = {
  kind: "check",
  path: "/repos/{owner}/{repo}/actions/runs/{run_id}",
  keep: ["status", "head_sha"],
  requires: [{ name: "status", equals: "waiting", reason: "The run is no longer waiting." }],
  requiredExpect: ["head_sha"],
  manual: deploymentsPage,
};

const readEnvironment: CheckStep = {
  kind: "check",
  path: "/repos/{owner}/{repo}/environments/{environment}",
  keep: ["id", "name"],
  requires: [
    {
      name: "id",
      equalsParameter: "environment_id",
      reason: "This isn't the environment the request names.",
    },
  ],
  manual: deploymentsPage,
};

const approve: CallStep = {
  kind: "call",
  method: "POST",
  path: "/repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments",
  body: [{ name: "environment_ids", kind: "parameter-list", parameter: "environment_id" }],
  keep: [],
  manual: deploymentsPage,
};

function definition(steps: StepperDefinition["steps"]): StepperDefinition {
  return {
    id: "github.approve-deployment",
    version: 1,
    service: "github",
    title: "Approve a deployment",
    summary: "Approves a waiting deployment.",
    risk: "admin",
    parameters: strictParameters({
      owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
      repo: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
      run_id: { kind: "integer", min: 1, max: 9_007_199_254_740_991 },
      environment_id: { kind: "integer", min: 1, max: 9_007_199_254_740_991 },
      environment: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,255}$/ },
    }),
    steps,
    targets: () => [],
    preview: () => [],
  };
}

const acmeApproval = definition([readRun, readEnvironment, approve]);
const keptBoth = new Map([
  [1, { status: "waiting", head_sha: "abc1234" }],
  [2, { id: 161, name: "release" }],
]);

verifies("action-steppers.check-gate-request", () => {
  describe("checkStepGate with requiredExpect and parameter rules", () => {
    it("lets the step run when the request names what it saw and the kept id is its parameter", () => {
      const result = checkStepGate(acmeApproval, 3, { head_sha: "abc1234" }, keptBoth, {
        environment_id: 161,
      });

      expect(result).toEqual({ ok: true });
    });

    it("refuses a request whose expect lacks a required name, before the check runs", () => {
      const result = checkStepGate(acmeApproval, 3, {}, new Map(), { environment_id: 161 });

      expect(result).toEqual({
        ok: false,
        check: 1,
        cause: "missing-expect",
        changes: [],
        message:
          "This request leaves out what the agent saw before asking, so Halonic can't check this step. Decline it and ask again.",
      });
    });

    it("refuses a parameter that differs from the kept value, with the rule's reason", () => {
      const result = checkStepGate(acmeApproval, 3, { head_sha: "abc1234" }, keptBoth, {
        environment_id: 162,
      });

      expect(result).toEqual({
        ok: false,
        check: 2,
        cause: "requires",
        changes: [],
        message: "This isn't the environment the request names.",
      });
    });

    it("fails closed when the caller passes no parameters", () => {
      const result = checkStepGate(acmeApproval, 3, { head_sha: "abc1234" }, keptBoth);

      expect(result).toMatchObject({ ok: false, check: 2, cause: "requires" });
    });

    it("doesn't read an inherited name as a parameter or an expect value", () => {
      const inherited = definition([
        {
          ...readEnvironment,
          requires: [{ name: "id", equalsParameter: "toString", reason: "Not this one." }],
        },
        approve,
      ]);
      const kept = new Map([[1, { id: 161 }]]);
      expect(checkStepGate(inherited, 2, {}, kept).ok).toBe(false);

      const expectsToString = definition([{ ...readRun, requiredExpect: ["toString"] }, approve]);
      expect(checkStepGate(expectsToString, 2, {}, new Map()).ok).toBe(false);
    });
  });

  describe("routesOf with requiredExpect and parameter rules", () => {
    it("accepts names the checks keep and parameters that exist", () => {
      expect(routesOf(acmeApproval)).toHaveLength(3);
    });

    it("throws for a required expect name the check doesn't keep", () => {
      const broken = definition([{ ...readRun, keep: ["status"] }]);

      expect(() => routesOf(broken)).toThrow(
        "github.approve-deployment@1 step 1: requiredExpect head_sha isn't a kept field",
      );
    });

    it("throws for a parameter rule whose parameter doesn't exist", () => {
      const broken = definition([
        {
          ...readEnvironment,
          requires: [{ name: "id", equalsParameter: "environment_key", reason: "Not this one." }],
        },
      ]);

      expect(() => routesOf(broken)).toThrow("{environment_key} isn't a parameter");
    });
  });
});
