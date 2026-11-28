import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manualFormProblems } from "./manual-guide.ts";
import { routesOf } from "./step-routes.ts";
import { planResume } from "./stepper-resume.ts";
import type { OperationStep, StepperDefinition } from "./stepper-types.ts";
import { type ParameterField, strictParameters } from "./strict-parameters.ts";

const setSecret: OperationStep = {
  kind: "operation",
  operation: "paperclip.set-secret",
  manual: {
    url: "https://{host}/{company}/company/settings/secrets",
    instructions: ["Open the secret {name} and paste the value."],
  },
};

const paperclipFields: Record<string, ParameterField> = {
  host: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ },
  company: { kind: "text", pattern: /^[A-Za-z0-9]{1,16}$/ },
  name: { kind: "text", pattern: /^[A-Z][A-Z0-9_]{0,63}$/ },
};

function definition(
  changes: Partial<Pick<StepperDefinition, "risk" | "service">> = {},
  fields: Record<string, ParameterField> = paperclipFields,
): StepperDefinition {
  return {
    id: "paperclip.set-secret",
    version: 1,
    service: "paperclip",
    title: "Store a key in Paperclip Secrets",
    summary: "Stores one named secret.",
    risk: "admin",
    ...changes,
    parameters: strictParameters(fields),
    steps: [setSecret],
    targets: () => [],
    preview: () => [],
  };
}

const { name: _name, ...withoutName } = paperclipFields;

verifies("action-steppers.operation-step", () => {
  describe("an operation step", () => {
    it("gets the operation's own route: its placeholders, its secret field and nothing kept", () => {
      expect(routesOf(definition())).toEqual([
        {
          definition: "paperclip.set-secret",
          version: 1,
          step: 1,
          kind: "operation",
          operation: "paperclip.set-secret",
          service: "paperclip",
          risk: "admin",
          placeholders: {
            company: "^[A-Za-z0-9]{1,16}$",
            host: "^[a-z0-9.-]{1,253}$",
            name: "^[A-Z][A-Z0-9_]{0,63}$",
          },
          body: [{ name: "value", kind: "secret-input" }],
          keep: [],
        },
      ]);
    });

    it("throws when the definition's risk isn't admin", () => {
      expect(() => routesOf(definition({ risk: "routine" }))).toThrow(
        "paperclip.set-secret@1 step 1: an operation step's definition must be admin",
      );
    });

    it("throws when the definition's service isn't the operation's", () => {
      expect(() => routesOf(definition({ service: "github" }))).toThrow(
        "paperclip.set-secret@1 step 1: the operation paperclip.set-secret belongs to paperclip, not github",
      );
    });

    it("throws when a placeholder of the operation has no parameter", () => {
      expect(() => routesOf(definition({}, withoutName))).toThrow(
        "paperclip.set-secret@1 step 1: the parameters must be exactly paperclip.set-secret's placeholders (company, host, name), not company, host",
      );
    });

    it("throws when the definition has a parameter the operation doesn't take", () => {
      const extra = {
        ...paperclipFields,
        agent: { kind: "text", pattern: /^[a-z]{1,8}$/ },
      } as const;
      expect(() => routesOf(definition({}, extra))).toThrow(
        "paperclip.set-secret@1 step 1: the parameters must be exactly paperclip.set-secret's placeholders (company, host, name), not agent, company, host, name",
      );
    });

    it("needs a manual form, as every API step does", () => {
      const bare = { ...definition(), steps: [{ ...setSecret, manual: undefined }] };
      expect(manualFormProblems(bare as unknown as StepperDefinition)).toEqual([
        "paperclip.set-secret@1 step 1: an API step needs a manual form",
      ]);
    });

    it("stops the stepper at a failed operation step on resume, with its manual form", () => {
      const plan = planResume(definition().steps, new Map([[1, "failed"]]));
      expect(plan).toMatchObject({ manual: setSecret.manual });
    });
  });
});
