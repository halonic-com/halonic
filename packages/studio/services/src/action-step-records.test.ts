import type { ActionRoute } from "@halonicjs/ports";
import { FakeActionRecords, FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createActionSteps, desktopOnlyActionSteps } from "./action-steps.ts";

const variablesPage: ActionRoute = {
  kind: "guided",
  definition: "github.set-variable",
  version: 1,
  step: 1,
  service: "github",
  risk: "routine",
  address: "https://github.com/{owner}/{repo}/settings/variables/actions/new",
  placeholders: { owner: "[a-z]+", repo: "[a-z]+" },
};
const page = {
  definition: "github.set-variable",
  version: 1,
  step: 1,
  placeholders: { owner: "acme", repo: "app" },
};
const at = "2026-11-25T09:00:00.000Z";

function setUp() {
  const fake = new FakeActionSender({ routes: [variablesPage], signInAs: { github: "acme-dev" } });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => new Date(at) });
  return { fake, records, steps };
}

verifies("services.action-step-records", () => {
  describe("the stepper's own records", () => {
    it("records a step the user did on the page as succeeded with no status, and only what they pasted", async () => {
      const { records, steps } = setUp();
      expect(await steps.confirmStep("req-1", 1, { runId: 123456 })).toEqual({
        outcome: "recorded",
      });
      expect(await steps.skipStep("req-1", 2)).toEqual({ outcome: "recorded" });
      expect(await records.read("req-1")).toEqual([
        { type: "action.step.succeeded", request: "req-1", at, step: 1, kept: { runId: 123456 } },
        { type: "action.step.skipped", request: "req-1", at, step: 2 },
      ]);
    });

    it("ends a request once: after action.finished nothing runs, opens or is recorded", async () => {
      const { fake, records, steps } = setUp();
      expect(await steps.finish("req-1", "declined")).toEqual({ outcome: "recorded" });
      expect(await steps.finish("req-1", "succeeded")).toEqual({ outcome: "closed" });
      expect(await steps.confirmStep("req-1", 1)).toEqual({ outcome: "closed" });
      expect(await steps.skipStep("req-1", 1)).toEqual({ outcome: "closed" });
      expect(await steps.openGuidedStep("req-1", page)).toEqual({ outcome: "closed" });
      expect(fake.opened).toEqual([]);
      expect(await records.read("req-1")).toEqual([
        { type: "action.finished", request: "req-1", at, outcome: "declined" },
      ]);
    });

    it("writes nothing outside the desktop app", async () => {
      expect(await desktopOnlyActionSteps.confirmStep("req-1", 1)).toEqual({
        outcome: "desktop-only",
      });
      expect(await desktopOnlyActionSteps.skipStep("req-1", 1)).toEqual({
        outcome: "desktop-only",
      });
      expect(await desktopOnlyActionSteps.finish("req-1", "declined")).toEqual({
        outcome: "desktop-only",
      });
    });
  });
});
