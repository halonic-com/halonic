// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StepOutcome, StepperStage, StepperView } from "../stepper-view.ts";
import {
  browserRequest,
  inStage,
  recordingActions,
  releaseRequest,
  routineRequest,
  withOutcomes,
} from "../test-support/acme-requests.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, rerender, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

/** Shows a view, and gives the next view the app service hands the screen after a press. */
function show(view: StepperView) {
  const actions = recordingActions();
  const root = render(<ActionStepper view={view} actions={actions} />);
  const next = (changed: StepperView) =>
    rerender(root, <ActionStepper view={changed} actions={actions} />);
  return { root, actions, next };
}

/** The stepper's one status region, outside the steps. */
function statusRegion(root: HTMLElement): HTMLElement | null {
  return root.querySelector('section > [role="status"]');
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

/** A keyboard press: the button has focus, then it's activated. */
async function press(target: HTMLElement) {
  await act(async () => {
    target.focus();
    target.click();
  });
}

function step(root: HTMLElement, number: number): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[data-step="${number}"]`);
  if (found === null) throw new Error(`no step ${number}`);
  return found;
}

const done: StepOutcome = { kind: "succeeded" };
const finished: StepperStage = { kind: "finished" };

verifies("action-steppers.results", () => {
  describe("the status region", () => {
    it("is there, empty, when the request opens, and then says each result", () => {
      const { root, next } = show(routineRequest());
      const region = statusRegion(root);
      expect(region?.textContent).toBe("");
      expect(region?.getAttribute("aria-atomic")).toBe("true");
      next(withOutcomes(routineRequest(), [done, { kind: "running" }]));
      expect(statusRegion(root)?.textContent).toBe("Done.");
      const started: StepOutcome = { kind: "succeeded", result: "Re-run started." };
      next(withOutcomes(routineRequest(), [done, started]));
      expect(statusRegion(root)).toBe(region);
      expect(region?.textContent).toBe("Done. Re-run started.");
      next(withOutcomes(routineRequest({ stage: finished }), [done, started, done]));
      expect(region?.textContent).toBe("Done. Finished. Every step is done.");
    });

    it("says nothing for a step that only started running", () => {
      const { root, next } = show(routineRequest());
      next(withOutcomes(routineRequest(), [{ kind: "running" }]));
      expect(statusRegion(root)?.textContent).toBe("");
    });

    it("says a failure when it arrives", () => {
      const { root, next } = show(withOutcomes(routineRequest(), [{ kind: "running" }]));
      next(withOutcomes(routineRequest(), [{ kind: "failed", status: 403, message: "Forbidden" }]));
      expect(statusRegion(root)?.textContent).toBe(
        "Failed with status 403. GitHub said: “Forbidden”",
      );
    });

    it("says the stage's line, and the missing permission, once the request reaches it", () => {
      const { root, next } = show(routineRequest());
      next(inStage({ kind: "declined" }));
      expect(statusRegion(root)?.textContent).toBe(
        "You declined this request. Nothing more will run.",
      );
      next(inStage({ kind: "missing-permission", permission: "Administration (write)" }));
      expect(statusRegion(root)?.textContent).toBe(
        "acme-admin doesn't have the permission “Administration (write)”, which this request needs.",
      );
    });
  });

  describe("focus when the pressed control goes away", () => {
    const title = (root: HTMLElement) => root.querySelector("h2");

    it("goes to the title after the last step", async () => {
      const lastLeft = withOutcomes(routineRequest(), [done, done]);
      const { root, next } = show(lastLeft);
      await press(button(root, "Run step 3 of 3"));
      next(withOutcomes(routineRequest({ stage: finished }), [done, done, done]));
      expect(document.activeElement).toBe(title(root));
    });

    it("goes to the title after Run all steps", async () => {
      const { root, next } = show(routineRequest());
      await press(button(root, "Run all steps"));
      next(withOutcomes(routineRequest({ stage: finished }), [done, done, done]));
      expect(document.activeElement).toBe(title(root));
    });

    it("goes to the title after the step that can't be undone is confirmed and done", async () => {
      const { root, actions, next } = show(withOutcomes(releaseRequest(), [done]));
      await press(button(root, "Run step 2 of 2"));
      await press(button(root.querySelector("dialog") ?? root, "Run step 2"));
      expect(actions.calls).toEqual(["run 2"]);
      next(withOutcomes(releaseRequest({ stage: finished }), [done, done]));
      expect(document.activeElement).toBe(title(root));
    });

    it("goes to the title after Decline", async () => {
      const { root, next } = show(routineRequest());
      await press(button(root, "Decline"));
      next(inStage({ kind: "declined" }));
      expect(document.activeElement).toBe(title(root));
    });

    it("goes to step 2's first control after Step 1 is done", async () => {
      const { root, next } = show(browserRequest());
      await press(button(step(root, 1), "Step 1 is done"));
      next(withOutcomes(browserRequest(), [done]));
      expect(document.activeElement).toBe(button(step(root, 2), "Open the page"));
    });

    it("goes to the step's own line after Mark done by hand, when no browser step is next", async () => {
      const { root, next } = show(routineRequest());
      await press(button(step(root, 1), "Mark done by hand"));
      next(withOutcomes(routineRequest(), [{ kind: "by-hand", checked: "The re-run shows" }]));
      expect(document.activeElement?.textContent).toBe("Checked: The re-run shows");
      expect(step(root, 1).contains(document.activeElement)).toBe(true);
    });

    it("goes to the code after Sign in to GitHub, and says it waits", async () => {
      const github = (code: string | null) =>
        inStage({ kind: "sign-in", signIn: { service: "github", code } }, { account: null });
      const { root, next } = show(github(null));
      await press(button(root, "Sign in to GitHub"));
      next(github("WDJBMJHT"));
      const code = document.activeElement?.querySelector('[role="img"]');
      expect(code?.getAttribute("aria-label")).toBe("Sign-in code: W, D, J, B, M, J, H, T");
      expect(statusRegion(root)?.textContent).toBe("Waiting for you to finish on GitHub…");
    });

    it("goes to the title after Sign in again", async () => {
      const missing = inStage({ kind: "missing-permission", permission: "Administration (write)" });
      const { root, next } = show(missing);
      await press(button(root, "Sign in again"));
      next(inStage({ kind: "sign-in", signIn: { service: "github", code: null } }));
      expect(document.activeElement).toBe(title(root));
    });

    it("stays on the pressed control when it is still there", async () => {
      const { root, next } = show(routineRequest());
      const run = button(root, "Run step 1 of 3");
      await press(run);
      next(withOutcomes(routineRequest(), [done]));
      expect(document.activeElement).toBe(run);
      expect(run.textContent?.startsWith("Run step 2 of 3")).toBe(true);
    });
  });
});
