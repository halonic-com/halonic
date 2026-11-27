// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { inStage, recordingActions } from "../test-support/acme-requests.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

afterEach(unmountAll);

const changed = {
  kind: "changed",
  message: 'This changed since the request: "required_approving_review_count", "branch".',
  changes: [
    { name: "required_approving_review_count", expected: 3, current: 1 },
    { name: "branch", expected: "main", current: undefined },
  ],
} as const;

verifies("action-steppers.expect-stop", () => {
  describe("a request stopped by a changed state", () => {
    it("says what changed in Halonic's sentence and shows each value apart from it, as data", () => {
      const root = render(<ActionStepper view={inStage(changed)} actions={recordingActions()} />);
      expect(root.textContent).toContain(changed.message);
      const rows = [...root.querySelectorAll("dd")]
        .filter((row) => row.textContent?.startsWith("When asked:"))
        .map((row) => [...row.children].map((line) => line.textContent));
      expect(rows).toEqual([
        ["When asked: 3", "Today: 1"],
        ['When asked: "main"', "Today: nothing found"],
      ]);
      const names = [...root.querySelectorAll("dt code")].map((name) => name.textContent);
      expect(names).toEqual(["required_approving_review_count", "branch"]);
    });

    it("offers no button that runs or declines anything", () => {
      const root = render(<ActionStepper view={inStage(changed)} actions={recordingActions()} />);
      const buttons = [...root.querySelectorAll("button")].map((button) => button.textContent);
      expect(buttons.filter((name) => /^Run|^Decline|^Mark done/.test(name ?? ""))).toEqual([]);
    });
  });
});
