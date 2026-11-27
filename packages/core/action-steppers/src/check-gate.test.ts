import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkStepGate } from "./check-gate.ts";
import { routesOf } from "./step-routes.ts";
import type { CallStep, CheckStep, StepperDefinition } from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";

const runnersPage = {
  url: "https://github.com/{owner}/{repo}/settings/actions/runners",
  instructions: ["Open the runner and check that it is offline."],
};

const readRunner: CheckStep = {
  kind: "check",
  path: "/repos/{owner}/{repo}/actions/runners/{runner}",
  keep: ["status", "name"],
  requires: [
    { name: "status", equals: "offline", reason: "The runner is still online. Stop it first." },
  ],
  manual: runnersPage,
};

const removeRunner: CallStep = {
  kind: "call",
  method: "DELETE",
  path: "/repos/{owner}/{repo}/actions/runners/{runner}",
  body: [],
  keep: [],
  manual: runnersPage,
};

function definition(steps: StepperDefinition["steps"]): StepperDefinition {
  return {
    id: "github.remove-runner",
    version: 1,
    service: "github",
    title: "Remove a runner",
    summary: "Removes a self-hosted runner.",
    risk: "admin",
    parameters: strictParameters({
      owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
      repo: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
      runner: { kind: "integer", min: 1, max: 2147483647 },
    }),
    steps,
    targets: () => [],
    preview: () => [],
  };
}

const acmeRunner = definition([readRunner, removeRunner]);

verifies("action-steppers.check-gate", () => {
  describe("checkStepGate", () => {
    it("lets the step run when the check kept what the definition requires", () => {
      const kept = new Map([[1, { status: "offline", name: "acme-build-1" }]]);

      expect(checkStepGate(acmeRunner, 2, {}, kept)).toEqual({ ok: true });
    });

    it("refuses with the definition's reason, never the service's value", () => {
      const kept = new Map([[1, { status: "online", name: "acme-build-1" }]]);

      expect(checkStepGate(acmeRunner, 2, {}, kept)).toEqual({
        ok: false,
        check: 1,
        cause: "requires",
        changes: [],
        message: "The runner is still online. Stop it first.",
      });
    });

    it("names a required field the check didn't read, instead of the rule's reason", () => {
      const result = checkStepGate(acmeRunner, 2, {}, new Map([[1, {}]]));

      expect(result).toEqual({
        ok: false,
        check: 1,
        cause: "not-read",
        changes: [],
        message: 'The check didn\'t read "status".',
      });
    });

    it("compares values with ===, so a kept 0 doesn't meet a required false", () => {
      const strict = definition([
        { ...readRunner, requires: [{ name: "status", equals: false, reason: "Not off." }] },
        removeRunner,
      ]);

      expect(checkStepGate(strict, 2, {}, new Map([[1, { status: 0 }]])).ok).toBe(false);
    });

    it("refuses a step whose check hasn't run yet", () => {
      expect(checkStepGate(acmeRunner, 2, {}, new Map())).toEqual({
        ok: false,
        check: 1,
        cause: "not-checked",
        changes: [],
        message: "Run the check before this step first.",
      });
    });

    it("stops on the request's expect first, with checkExpect's sentence", () => {
      const kept = new Map([[1, { status: "offline", name: "acme-build-2" }]]);

      const result = checkStepGate(acmeRunner, 2, { name: "acme-build-1" }, kept);

      expect(result).toEqual({
        ok: false,
        check: 1,
        cause: "expect",
        changes: [{ name: "name", expected: "acme-build-1", current: "acme-build-2" }],
        message: 'This changed since the request: "name".',
      });
    });

    it("leaves an expect value another check keeps to that check", () => {
      const kept = new Map([[1, { status: "offline", name: "acme-build-1" }]]);

      expect(checkStepGate(acmeRunner, 2, { headSha: "abc1234" }, kept)).toEqual({ ok: true });
    });

    it("doesn't hold up a check with nothing to compare, nor the check step itself", () => {
      const plain = definition([{ ...readRunner, requires: [] }, removeRunner]);

      expect(checkStepGate(plain, 2, {}, new Map())).toEqual({ ok: true });
      expect(checkStepGate(acmeRunner, 1, {}, new Map())).toEqual({ ok: true });
    });
  });

  describe("routesOf with requires", () => {
    it("refuses a requires rule that names a field the check doesn't keep", () => {
      const broken = definition([
        { ...readRunner, requires: [{ name: "busy", equals: false, reason: "Busy." }] },
        removeRunner,
      ]);

      expect(() => routesOf(broken)).toThrow(
        "github.remove-runner@1 step 1: requires busy isn't a kept field",
      );
    });
  });
});
