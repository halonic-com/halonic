// @vitest-environment jsdom
import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stepOutcome } from "../run/record-fold.ts";
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
  const copied: string[] = [];
  const writeClipboard = vi.fn(async (text: string) => {
    copied.push(text);
    return true;
  });
  const root = render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <ActionStepper view={view} actions={actions} />
    </ClipboardProvider>,
  );
  return { root, actions, copied };
}

function buttonNames(root: ParentNode): string[] {
  return [...root.querySelectorAll("button")].map((b) => b.textContent ?? "");
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

function buttons(root: ParentNode, name: string): HTMLButtonElement[] {
  return [...root.querySelectorAll("button")].filter((b) => b.textContent?.startsWith(name));
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

    it("names the service and the status of a failure, copies its message, and resumes there", async () => {
      const view = withOutcomes(routineRequest(), [
        { kind: "succeeded" },
        { kind: "failed", status: 403, message: "Resource not accessible by integration" },
      ]);
      const { root, actions, copied } = show(view);
      const line = root.querySelectorAll("ol > li")[1]?.textContent;
      expect(line).toContain("Failed: GitHub refused this step (status 403).");
      // The service's own words go only to Copy details (microcopy 1.6 E3, C805 A7).
      expect(line).not.toContain("Resource not accessible");
      await click(button(root, "Copy details"));
      expect(copied).toEqual(["Status 403. GitHub said: “Resource not accessible by integration”"]);
      await click(button(root, "Try step 2 again"));
      expect(actions.calls).toEqual(["run 2"]);
    });

    it("words a check that found more than one match itself, never as the service's refusal or words", async () => {
      const outcome = stepOutcome({
        type: "action.step.failed",
        request: "req-1",
        at: "2026-11-25T09:00:00.000Z",
        step: 2,
        failure: "more-than-one",
        status: 200,
      });
      const { root, copied } = show(
        withOutcomes(routineRequest(), [{ kind: "succeeded" }, outcome]),
      );
      const words =
        "The service found more than one match, and this step works on exactly one. (status 200)";
      const line = root.querySelectorAll("ol > li")[1]?.textContent;
      expect(line).toContain(`Failed. ${words}`);
      expect(line).not.toContain("refused");
      await click(button(root, "Copy details"));
      expect(copied).toEqual([words]);
    });

    it("starts nothing while a step runs, and says why its buttons can't be used", async () => {
      const { root, actions } = show(withOutcomes(routineRequest(), [{ kind: "running" }]));
      const markDone = buttons(root, "Mark done by hand");
      // One per step: step 1 is running, steps 2 and 3 wait for it (HAL-17527 review).
      expect(markDone).toHaveLength(3);
      const waiting = [button(root, "Run all steps"), button(root, "Decline"), ...markDone];
      for (const target of [button(root, "Run step 1 of 3"), ...waiting]) await click(target);
      expect(actions.calls).toEqual([]);
      for (const target of waiting) {
        expect(target.getAttribute("aria-disabled")).toBe("true");
        const reason = target.getAttribute("aria-describedby") ?? "";
        expect(root.querySelector(`[id="${reason}"]`)?.textContent).toBe("Running…");
      }
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

    it("says so right under the title, before the facts and the steps", () => {
      const { root } = show(inStage({ kind: "expired" }));
      const line = [...root.querySelectorAll("div")].find(
        (div) => div.textContent === "This request has expired, so it can't run anymore.",
      );
      expect(root.querySelector("h2")?.compareDocumentPosition(line as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      for (const later of [root.querySelector("dl"), root.querySelector("ol")]) {
        expect(line?.compareDocumentPosition(later as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
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
