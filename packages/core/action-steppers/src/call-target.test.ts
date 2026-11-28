import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { routesOf } from "./step-routes.ts";
import type { CallStep, StepperDefinition } from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";

const where = "acme.approve-deployment@1 step 1";

const approve: CallStep = {
  kind: "call",
  method: "POST",
  path: "/repos/{owner}/{repo}/actions/runs/{runId}/pending_deployments",
  body: [{ name: "state", kind: "constant", value: "approved" }],
  keep: ["id"],
  target: "{owner}/{repo} run {runId}",
  manual: {
    url: "https://github.com/{owner}/{repo}/actions/runs/{runId}",
    instructions: ["Approve it."],
  },
};

function definition(
  step: CallStep,
  risk: StepperDefinition["risk"] = "irreversible",
): StepperDefinition {
  return {
    id: "acme.approve-deployment",
    version: 1,
    service: "github",
    title: "Approve a deployment",
    summary: "Approves a run's waiting deployment.",
    risk,
    parameters: strictParameters({
      owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
      repo: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
      runId: { kind: "integer", min: 1, max: 2 ** 53 - 1 },
      environment: { kind: "choice", options: ["staging", "release"], optional: true },
    }),
    steps: [step],
    targets: () => [],
    preview: () => [],
  };
}

function withTarget(target: string): StepperDefinition {
  return definition({ ...approve, target });
}

verifies("action-steppers.call-target", () => {
  describe("routesOf and an irreversible call's target", () => {
    it("writes the target on an irreversible call's route", () => {
      expect(routesOf(definition(approve))).toEqual([
        expect.objectContaining({
          kind: "call",
          risk: "irreversible",
          target: "{owner}/{repo} run {runId}",
        }),
      ]);
    });

    it("leaves the target off a call of another risk", () => {
      const { target: _, ...plain } = approve;
      expect(routesOf(definition(plain, "admin"))[0]).not.toHaveProperty("target");
    });

    it("throws for an irreversible call without a target", () => {
      const { target: _, ...untargeted } = approve;
      expect(() => routesOf(definition(untargeted))).toThrow(
        `${where}: an irreversible call needs a target`,
      );
    });

    it("throws for a target on a call that isn't irreversible", () => {
      expect(() => routesOf(definition(approve, "admin"))).toThrow(
        `${where}: only an irreversible call has a target`,
      );
    });

    it("throws for a part that isn't one of the route's placeholders", () => {
      for (const name of ["environment", "run id", ""]) {
        const target = `{owner}/{repo} run {${name}}`;
        expect(() => routesOf(withTarget(target))).toThrow(
          `${where}: \`{${name}}\` in the target \`${target}\` isn't one of the route's placeholders or text body fields`,
        );
      }
    });

    it("takes a text body field in the target, but not a constant or an integer", () => {
      // Liam's condition 3 on HAL-21185: a new repository is typed as `{owner}/{name}`.
      const create: CallStep = {
        ...approve,
        path: "/orgs/{owner}/repos",
        body: [
          { name: "repo", kind: "parameter" },
          { name: "runId", kind: "parameter" },
          { name: "state", kind: "constant", value: "approved" },
        ],
        target: "{owner}/{repo}",
      };
      expect(routesOf(definition(create))[0]).toMatchObject({ target: "{owner}/{repo}" });
      for (const name of ["runId", "state"]) {
        const target = `{owner}/{${name}}`;
        expect(() => routesOf(definition({ ...create, target }))).toThrow(
          `${where}: \`{${name}}\` in the target \`${target}\` isn't one of the route's placeholders or text body fields`,
        );
      }
    });

    it("throws for an unclosed {", () => {
      expect(() => routesOf(withTarget("run {runId"))).toThrow(
        `${where}: the target \`run {runId\` has an unclosed \`{\``,
      );
    });

    it("throws for a stray } or a hidden character", () => {
      for (const target of [
        "{runId}}",
        "run } {runId}",
        "run\u200F{runId}",
        "{runId}\n",
        "run\u2066{runId}",
      ]) {
        expect(() => routesOf(withTarget(target))).toThrow(
          `${where}: the target \`${target}\` has a stray \`}\` or a hidden character`,
        );
      }
    });

    it("throws for a target that names no placeholder", () => {
      for (const target of ["acme run", ""]) {
        expect(() => routesOf(withTarget(target))).toThrow(
          `${where}: the target \`${target}\` names no placeholder`,
        );
      }
    });
  });
});
