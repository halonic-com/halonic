import {
  defaultRequesterPolicy,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog, acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import { acmePaperclips } from "../test-support/acme-sign-in.test-helper.ts";
import { actionLine } from "../ui/stepper-words.ts";
import { reviewActionItem } from "./action-item-review.ts";

/** An invented definition with one of the desktop app's own operations, for the `acme` Paperclip. */
const storeSecret: StepperDefinition<Record<string, string | number>> = {
  id: "paperclip.store-secret-example",
  version: 1,
  service: "paperclip",
  title: "Store a key",
  summary: "Stores one named secret.",
  risk: "admin",
  parameters: strictParameters({
    host: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ },
    company: { kind: "text", pattern: /^[A-Za-z0-9]{1,16}$/ },
    name: { kind: "text", pattern: /^[A-Z][A-Z0-9_]{0,63}$/ },
  }),
  steps: [
    {
      kind: "operation",
      operation: "paperclip.set-secret",
      manual: {
        url: "https://{host}/{company}/company/settings/secrets",
        instructions: ["Open the secret {name} and paste the value."],
      },
    },
  ],
  targets: (parameters) => [
    { service: "paperclip", kind: "secret", name: String(parameters["name"]) },
  ],
  preview: (parameters) => [`Stores ${parameters["name"]}.`],
};

verifies("action-steppers.review", () => {
  describe("a request with one of the desktop app's own operations", () => {
    it("names the operation in Show the request, and never a value", () => {
      const catalog = {
        ...acmeCatalog,
        definition: (id: string, version: number) =>
          id === storeSecret.id && version === 1
            ? storeSecret
            : acmeCatalog.definition(id, version),
      };
      const item = actionItem({
        definition: storeSecret.id,
        version: 1,
        parameters: { host: "paperclip.acme.example", company: "ACME", name: "ACME_API_KEY" },
        expires: "2026-11-25T12:00:00.000Z",
      });
      const reviewed = reviewActionItem(item, acmeSource, {
        catalog,
        policy: defaultRequesterPolicy,
        now: new Date("2026-11-24T13:00:00.000Z"),
        paperclips: acmePaperclips,
      });
      if (reviewed.kind !== "stepper") throw new Error(reviewed.reasons.join("; "));
      const [action] = reviewed.view.steps.map((step) => step.action);
      expect(action).toEqual({ kind: "operation", operation: "paperclip.set-secret" });
      if (action === undefined || action.kind === "call") throw new Error("not an operation");
      expect(actionLine(action)).toBe(
        "Runs the desktop app's own step paperclip.set-secret; you type the value into its secure field",
      );
    });
  });
});
