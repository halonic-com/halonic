// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { StepperView } from "../stepper-view.ts";
import {
  browserRequest,
  inStage,
  recordingActions,
} from "../test-support/acme-requests.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

afterEach(unmountAll);

function show(view: StepperView) {
  const actions = recordingActions();
  const root = render(<ActionStepper view={view} actions={actions} />);
  return { root, actions };
}

function buttons(root: HTMLElement): string[] {
  return [...root.querySelectorAll("button")].map((button) => button.textContent ?? "");
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

const reviewOnly = { kind: "desktop-only" } as const;

verifies("action-steppers.review-mode", () => {
  describe("review mode", () => {
    it("offers Copy instructions alone on each browser step, and Decline", () => {
      const { root } = show({ ...browserRequest(), stage: reviewOnly });
      expect(root.textContent).toContain("Open it in the desktop app to run it.");
      expect(buttons(root).filter((name) => name === "Copy instructions")).toHaveLength(2);
      expect(buttons(root)).not.toContain("Open the page");
      expect(buttons(root).some((name) => name.startsWith("Step 1 is done"))).toBe(false);
      expect(buttons(root)).toContain("Decline");
    });

    it("says a blocked request is blocked by the user's settings, and offers only Decline", () => {
      const { root, actions } = show({ ...browserRequest(), stage: { kind: "blocked" } });
      expect(root.textContent).toContain(
        "Blocked by your settings. This requester may only ask for steps marked Routine.",
      );
      expect(buttons(root).filter((name) => name !== "Show the request")).toEqual(["Decline"]);
      act(() => button(root, "Decline").click());
      expect(actions.calls).toEqual(["decline"]);
    });

    it("writes a script step and a secret input in Show the request", () => {
      const view = inStage(reviewOnly);
      const [first, second] = view.steps;
      if (first === undefined || second === undefined) throw new Error("two steps expected");
      const steps = [
        { ...first, action: { kind: "script", script: "github/approve-deployment" } as const },
        { ...second, action: { kind: "input", label: "Variable value", secret: true } as const },
      ];
      const { root } = show({ ...view, steps });
      const calls = [...root.querySelectorAll("pre")].map((pre) => pre.textContent);
      expect(calls).toEqual([
        "Runs the reviewed script github/approve-deployment",
        "You type “Variable value” into the desktop app's secure field",
      ]);
    });
  });
});
