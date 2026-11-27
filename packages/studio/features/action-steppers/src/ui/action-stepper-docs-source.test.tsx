// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import {
  acmeSource,
  actionItem,
  catalogCheckedOn,
  setVariableRequest,
} from "../test-support/acme-catalog.test-helper.ts";
import { recordingActions } from "../test-support/acme-requests.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

afterEach(unmountAll);

const now = new Date("2026-11-24T13:00:00.000Z");

/** The set-variable request on its stepper screen, its guided step's `checkedOn` set to `checkedOn`. */
function showCheckedOn(checkedOn: string): HTMLElement {
  const reviewed = reviewActionItem(actionItem(setVariableRequest), acmeSource, {
    catalog: catalogCheckedOn(checkedOn),
    policy: { allowed: [] },
    now,
  });
  if (reviewed.kind !== "stepper") throw new Error(reviewed.reasons.join("; "));
  return render(<ActionStepper view={reviewed.view} actions={recordingActions()} />);
}

/** The first step's item in the list of steps. */
function firstStep(root: HTMLElement): HTMLElement {
  const heading = [...root.querySelectorAll("h3")].find((h) => h.textContent === "Steps");
  const first = heading?.parentElement?.querySelector("ol")?.firstElementChild;
  if (!(first instanceof HTMLElement)) throw new Error("no first step");
  return first;
}

verifies("action-steppers.browser-docs", () => {
  describe("a guided step's source line", () => {
    it("says a step written from docs comes from the service's docs, not a date", () => {
      const step = firstStep(showCheckedOn("from docs"));
      expect(step.textContent).toContain("From the service's docs, not checked on the page");
      expect(step.textContent).not.toContain("Checked on");
    });

    it.each(["last spring", "2026-02-31", "2026-11"])("shows no NaN for checkedOn %j", (value) => {
      const root = showCheckedOn(value);
      expect(firstStep(root).textContent).toContain("Not checked on the page");
      expect(root.textContent).not.toContain("NaN");
      expect(root.textContent).not.toContain("undefined");
    });

    it("keeps the date for a step checked on a day", () => {
      const step = firstStep(showCheckedOn("2026-11-27"));
      expect(step.textContent).toContain("Checked on 27 Nov");
    });
  });
});
