import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manualFormProblems } from "./manual-guide.ts";
import { routesOf } from "./step-routes.ts";
import { planResume } from "./stepper-resume.ts";
import type { CallStep, CheckStep, StepperDefinition } from "./stepper-types.ts";
import { type ParameterField, strictParameters } from "./strict-parameters.ts";

const environmentPage = {
  url: "https://github.com/{owner}/{repo}/settings/environments",
  instructions: ["Open the environment {environment}."],
};

const readEnvironment: CheckStep = {
  kind: "check",
  path: "/repos/{owner}/{repo}/environments/{environment}",
  keep: ["wait_timer"],
  manual: environmentPage,
};

const setWaitTimer: CallStep = {
  kind: "call",
  method: "PUT",
  path: "/repos/{owner}/{repo}/environments/{environment}",
  body: [
    { name: "wait_timer", kind: "parameter" },
    { name: "prevent_self_review", kind: "constant", value: true },
  ],
  keep: ["name"],
  manual: environmentPage,
};

const acmeFields: Record<string, ParameterField> = {
  owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
  repo: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
  environment: { kind: "choice", options: ["staging", "release"] },
  wait_timer: { kind: "integer", min: 0, max: 43200 },
};

function definition(
  steps: StepperDefinition["steps"],
  fields: Record<string, ParameterField> = acmeFields,
): StepperDefinition {
  return {
    id: "github.set-wait-timer",
    version: 1,
    service: "github",
    title: "Set the wait timer",
    summary: "Sets an environment's wait timer.",
    risk: "admin",
    parameters: strictParameters(fields),
    steps,
    targets: () => [],
    preview: () => [],
  };
}

// As written, so the shell's pattern subset, which has no groups, can read them.
const ownerPattern = "^[A-Za-z0-9-]{1,39}$";
const repoPattern = "^[A-Za-z0-9._-]{1,100}$";
const environmentPattern = "^(?:staging|release)$";

verifies("action-steppers.api-steps", () => {
  describe("routesOf", () => {
    it("keeps a text pattern as written and wraps only one with a top-level |", () => {
      const fields = { ...acmeFields, owner: { kind: "text", pattern: /^acme|beta$/ } } as const;
      const [check] = routesOf(definition([readEnvironment], fields));
      expect(check?.placeholders).toEqual({
        owner: "^(?:acme|beta)$",
        repo: repoPattern,
        environment: environmentPattern,
      });
    });

    it("gives a check a routine GET with no body and a call its method, body and risk", () => {
      const [check, call] = routesOf(definition([readEnvironment, setWaitTimer]));
      const placeholders = {
        owner: ownerPattern,
        repo: repoPattern,
        environment: environmentPattern,
      };

      expect(check).toEqual({
        kind: "call",
        definition: "github.set-wait-timer",
        version: 1,
        step: 1,
        service: "github",
        risk: "routine",
        method: "GET",
        path: "/repos/{owner}/{repo}/environments/{environment}",
        body: [],
        keep: ["wait_timer"],
        placeholders,
      });
      expect(call).toMatchObject({
        step: 2,
        risk: "admin",
        method: "PUT",
        body: [
          { name: "wait_timer", kind: "integer" },
          { name: "prevent_self_review", kind: "constant", value: true },
        ],
        keep: ["name"],
        placeholders,
      });
    });

    it("gives a guided step its address and skips input and script steps", () => {
      const routes = routesOf(
        definition([
          { kind: "input", name: "token", label: "Token", secret: true },
          {
            kind: "guided",
            address: "https://github.com/{owner}/{repo}/settings",
            instructions: ["Open Settings."],
            checkedOn: "2026-11-26",
          },
          { kind: "script", ref: "acme/sync", manual: environmentPage },
        ]),
      );

      expect(routes).toEqual([
        {
          kind: "guided",
          definition: "github.set-wait-timer",
          version: 1,
          step: 2,
          service: "github",
          risk: "admin",
          address: "https://github.com/{owner}/{repo}/settings",
          placeholders: { owner: ownerPattern, repo: repoPattern },
        },
      ]);
    });

    it("takes a text body field's pattern from its parameter", () => {
      const [route] = routesOf(
        definition([{ ...setWaitTimer, body: [{ name: "repo", kind: "parameter" }] }]),
      );

      expect(route).toMatchObject({
        body: [{ name: "repo", kind: "string", pattern: repoPattern }],
      });
    });

    it("throws for a placeholder or body field that isn't a parameter", () => {
      const branchPath = { ...setWaitTimer, path: "/repos/{owner}/{repo}/branches/{branch}" };
      expect(() => routesOf(definition([branchPath]))).toThrow(
        "github.set-wait-timer@1 step 1: {branch} isn't a parameter",
      );
      const extraField = {
        ...setWaitTimer,
        body: [{ name: "reviewers", kind: "parameter" as const }],
      };
      expect(() => routesOf(definition([extraField]))).toThrow("{reviewers} isn't a parameter");
    });

    it("throws for an optional placeholder and for a pattern with the i flag", () => {
      const optionalRepo = {
        ...acmeFields,
        repo: { kind: "text" as const, pattern: /^[a-z]+$/, optional: true },
      };
      expect(() => routesOf(definition([readEnvironment], optionalRepo))).toThrow(
        "{repo} can't be an optional parameter",
      );
      const caseless = { ...acmeFields, owner: { kind: "text" as const, pattern: /^[a-z-]+$/i } };
      expect(() => routesOf(definition([readEnvironment], caseless))).toThrow(
        "can't have the i flag",
      );
    });
  });

  describe("call and check steps elsewhere in the stepper", () => {
    it("needs a manual form with an https page on each", () => {
      const noPage = {
        ...readEnvironment,
        manual: { url: "http://example.test", instructions: ["x"] },
      };
      expect(manualFormProblems(definition([noPage, setWaitTimer]))).toEqual([
        "github.set-wait-timer@1 step 1: the manual form's page must be an https address",
      ]);
    });

    it("stops at a failed check on resume and links its page", () => {
      expect(planResume([readEnvironment, setWaitTimer], new Map([[1, "failed"]]))).toEqual({
        kind: "stop",
        step: 1,
        reason: "may-have-happened",
        manual: environmentPage,
      });
    });
  });
});
