import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { routesOf } from "./step-routes.ts";
import type { CallStep, StepperDefinition } from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";

const deploymentsPage = {
  url: "https://github.com/{owner}/{repo}/actions/runs/{run_id}",
  instructions: ["Open Review deployments."],
};

const approveDeployment: CallStep = {
  kind: "call",
  method: "POST",
  path: "/repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments",
  body: [
    { name: "environment_ids", kind: "parameter-list", parameter: "environment_id" },
    { name: "state", kind: "constant", value: "approved" },
  ],
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
    }),
    steps,
    targets: () => [],
    preview: () => [],
  };
}

verifies("action-steppers.list-body-field", () => {
  describe("routesOf with a parameter-list body field", () => {
    it("builds an integer-list field under the field's own name", () => {
      const [route] = routesOf(definition([approveDeployment]));

      expect(route).toMatchObject({
        method: "POST",
        body: [
          { name: "environment_ids", kind: "integer-list" },
          { name: "state", kind: "constant", value: "approved" },
        ],
      });
    });

    it("throws for a list of a parameter that is missing or isn't an integer", () => {
      const listOf = (parameter: string): CallStep => ({
        ...approveDeployment,
        body: [{ name: "environment_ids", kind: "parameter-list", parameter }],
      });

      expect(() => routesOf(definition([listOf("environment")]))).toThrow(
        "github.approve-deployment@1 step 1: {environment} isn't a parameter",
      );
      expect(() => routesOf(definition([listOf("repo")]))).toThrow(
        "list field environment_ids needs an integer parameter, and {repo} isn't one",
      );
    });
  });
});
