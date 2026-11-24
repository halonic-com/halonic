// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StepperView } from "../stepper-view.ts";
import {
  inStage,
  recordingActions,
  releaseRequest,
  routineRequest,
  rulesetRequest,
  withOutcomes,
} from "../test-support/acme-requests.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function show(view: StepperView) {
  const actions = recordingActions();
  const root = render(<ActionStepper view={view} actions={actions} />);
  return { root, actions };
}

function buttonNames(root: ParentNode): string[] {
  return [...root.querySelectorAll("button")].map((b) => b.textContent ?? "");
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

verifies("action-steppers.run", () => {
  describe("step by step", () => {
    it("runs the next step by its number", async () => {
      const { root, actions } = show(withOutcomes(routineRequest(), [{ kind: "succeeded" }]));
      await click(button(root, "Run step 2 of 3"));
      expect(actions.calls).toEqual(["run 2"]);
    });

    it("shows each step's result, and Done already for a skipped step", () => {
      const view = withOutcomes(routineRequest(), [
        { kind: "skipped" },
        { kind: "succeeded", result: "The re-run is run 123457." },
      ]);
      const { root } = show(view);
      const steps = [...root.querySelectorAll("ol > li")].map((li) => li.textContent);
      expect(steps[0]).toContain("Done already");
      expect(steps[1]).toContain("Done. The re-run is run 123457.");
      expect(button(root, "Run step 3 of 3")).toBeDefined();
    });

    it("shows a failure's status and the service's message, and resumes from that step", async () => {
      const view = withOutcomes(routineRequest(), [
        { kind: "succeeded" },
        { kind: "failed", status: 403, message: "Resource not accessible by integration" },
      ]);
      const { root, actions } = show(view);
      expect(root.querySelector('[role="status"], [aria-live]')?.textContent).toContain(
        "Failed with status 403. GitHub said: “Resource not accessible by integration”",
      );
      await click(button(root, "Try step 2 again"));
      expect(actions.calls).toEqual(["run 2"]);
    });

    it("starts nothing while a step runs", async () => {
      const { root, actions } = show(withOutcomes(routineRequest(), [{ kind: "running" }]));
      await click(button(root, "Run step 1 of 3"));
      await click(button(root, "Run all steps"));
      await click(button(root, "Decline"));
      expect(actions.calls).toEqual([]);
    });

    it("offers Run all steps only when every step is routine", async () => {
      const { root, actions } = show(routineRequest());
      await click(button(root, "Run all steps"));
      expect(actions.calls).toEqual(["run all"]);
    });

    it("has no Run all steps when a step is admin", () => {
      const { root } = show(rulesetRequest());
      expect(buttonNames(root)).not.toContain("Run all steps");
    });

    it("has no Run all steps when a step is irreversible", () => {
      const { root } = show(releaseRequest());
      expect(buttonNames(root)).not.toContain("Run all steps");
    });
  });

  describe("an irreversible step", () => {
    const secondStepLeft = () => withOutcomes(releaseRequest(), [{ kind: "succeeded" }]);

    it("runs only after the extra confirmation", async () => {
      const { root, actions } = show(secondStepLeft());
      await click(button(root, "Run step 2 of 2"));
      expect(actions.calls).toEqual([]);
      const dialog = root.querySelector("dialog");
      expect(dialog?.textContent).toContain("Run step 2? It can't be undone.");
      expect(dialog?.textContent).toContain("Approves the deployment of acme/app to release");
      await click(button(dialog ?? root, "Run step 2"));
      expect(actions.calls).toEqual(["run 2"]);
    });

    it("runs nothing when the confirmation is cancelled", async () => {
      const { root, actions } = show(secondStepLeft());
      await click(button(root, "Run step 2 of 2"));
      await click(button(root.querySelector("dialog") ?? root, "Cancel"));
      expect(actions.calls).toEqual([]);
      expect(root.querySelector("dialog[open]")).toBeNull();
    });
  });
});

verifies("action-steppers.end", () => {
  describe("when nothing more runs", () => {
    it.each([
      [{ kind: "declined" }, "You declined this request. Nothing more will run."],
      [{ kind: "expired" }, "This request has expired, so it can't run anymore."],
      [{ kind: "finished" }, "Finished. Every step is done."],
    ] as const)("says so for %o, with no buttons", (stage, line) => {
      const { root } = show(inStage(stage));
      expect(root.textContent).toContain(line);
      expect(buttonNames(root)).toEqual([]);
    });

    it("says a request this version doesn't know isn't available, with no steps", () => {
      const { root } = show(inStage({ kind: "not-available" }, { steps: [] }));
      expect(root.textContent).toContain(
        "This request isn't available in this version of Halonic, so it can't run here.",
      );
      expect(root.querySelector("ol, details")).toBeNull();
      expect(buttonNames(root)).toEqual([]);
    });

    it("sends the user to the desktop app to run it, and still lets them decline", async () => {
      const { root, actions } = show(inStage({ kind: "desktop-only" }));
      expect(root.textContent).toContain("Open it in the desktop app to run it.");
      expect(buttonNames(root)).toEqual(["Decline"]);
      await click(button(root, "Decline"));
      expect(actions.calls).toEqual(["decline"]);
    });
  });
});
