import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog } from "./acme-catalog.fixture.ts";
import cases from "./golden/server-session-cases.json" with { type: "json" };
import { stepperBlockSchema, stepperRequestFormat } from "./stepper-request.ts";
import { validateStepperRequest } from "./validate-stepper-request.ts";

const serverSession = {
  kind: "server-session",
  task: "HAL-1234",
  steps: ["Pull main in the acme checkout.", "Restart the acme worker."],
  doneWhen: "The worker answers on build.acme.example/health.",
};
const browser = {
  kind: "browser",
  url: "https://github.com/acme/app/settings/variables/actions",
  instructions: ["Click New variable."],
};

function request(...blocks: unknown[]): string {
  return JSON.stringify({
    format: stepperRequestFormat,
    title: "Restart the acme worker",
    reason: "The deploy is stuck.",
    blocks,
  });
}

function reasons(json: string): string[] {
  const checked = validateStepperRequest(json, acmeCatalog);
  return checked.ok ? [] : checked.error;
}

verifies("action-steppers.server-session-request", () => {
  describe("a server-session block", () => {
    it("is taken as a request's only block, with the risk irreversible and its task as the target", () => {
      const checked = validateStepperRequest(request(serverSession), acmeCatalog);
      expect(checked.ok && checked.value.risk).toBe("irreversible");
      expect(checked.ok && checked.value.touches).toEqual([
        {
          block: 1,
          risk: "irreversible",
          targets: [{ service: "server", kind: "task", name: "HAL-1234" }],
        },
      ]);
    });

    it("is refused next to any other block", () => {
      expect(reasons(request(serverSession, browser))).toEqual([
        "blocks: a server-session block must be the request's only block",
      ]);
      expect(reasons(request(serverSession, serverSession))).toHaveLength(1);
    });

    it("is never a block ToolScript's header steps can carry", () => {
      expect(parse(stepperBlockSchema, serverSession).ok).toBe(false);
    });

    it.each(cases.tasks.refused)("refuses the task id %j", (task) => {
      expect(reasons(request({ ...serverSession, task }))[0]).toMatch(/^block 1: task: /);
    });

    it.each(cases.tasks.valid)("takes the task id %j", (task) => {
      expect(reasons(request({ ...serverSession, task }))).toEqual([]);
    });

    it("refuses a step that holds a line break, so it can't add a line of its own", () => {
      const steps = ["Restart the worker.\nDone when: nothing"];
      expect(reasons(request({ ...serverSession, steps }))[0]).toMatch(/^block 1: steps\[0\]: /);
    });

    it("refuses a step shaped like a key, without echoing it", () => {
      const key = ["sk-", "ant-", "A1b2".repeat(6)].join("");
      const checked = reasons(request({ ...serverSession, steps: [`Use ${key} to sign in.`] }));
      expect(checked).toEqual(["block 1: it holds text shaped like a key (ai-provider-key)"]);
      expect(checked.join("")).not.toContain(key);
    });

    it("refuses more than 20 steps, a step over 300 characters and an unknown field", () => {
      expect(reasons(request({ ...serverSession, steps: Array(21).fill("Step.") }))).toHaveLength(
        1,
      );
      expect(reasons(request({ ...serverSession, steps: ["a".repeat(301)] }))).toHaveLength(1);
      expect(reasons(request({ ...serverSession, host: "build.acme.example" }))).toHaveLength(1);
    });
  });
});
