import {
  defaultRequesterPolicy,
  type SignInPhase,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog, acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import { acmePaperclipHosts } from "../test-support/acme-sign-in.test-helper.ts";
import { actionLine } from "../ui/stepper-words.ts";
import { reviewActionItem } from "./action-item-review.ts";

const phases: readonly SignInPhase[] = ["start", "approve", "keep", "test"];

/** An invented sign-in definition for the `acme` Paperclip. */
const signIn: StepperDefinition<Record<string, string | number>> = {
  id: "paperclip.sign-in-example",
  version: 1,
  service: "paperclip",
  title: "Sign in to Paperclip",
  summary: "Signs in.",
  risk: "routine",
  parameters: strictParameters({ host: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ } }),
  steps: phases.map((phase) => ({
    kind: "sign-in",
    service: "paperclip",
    phase,
    manual: { url: "https://{host}/", instructions: ["Follow Studio."] },
  })),
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
  ],
  preview: () => phases.map((phase) => `The ${phase} part.`),
};

verifies("action-steppers.paperclip-sign-in-review", () => {
  describe("a request with a Paperclip sign-in", () => {
    it("keeps each part of the sign-in and says what it does", () => {
      const catalog = {
        ...acmeCatalog,
        definition: (id: string, version: number) =>
          id === signIn.id && version === 1 ? signIn : acmeCatalog.definition(id, version),
      };
      const item = actionItem({
        definition: signIn.id,
        version: 1,
        parameters: { host: "paperclip.acme.example" },
        expires: "2026-11-25T12:00:00.000Z",
      });
      const reviewed = reviewActionItem(item, acmeSource, {
        catalog,
        policy: defaultRequesterPolicy,
        now: new Date("2026-11-24T13:00:00.000Z"),
        paperclipHosts: acmePaperclipHosts,
      });
      if (reviewed.kind !== "stepper") throw new Error(reviewed.reasons.join("; "));
      const actions = reviewed.view.steps.map((step) => step.action);
      expect(actions).toEqual(phases.map((phase) => ({ kind: "sign-in", phase })));
      expect(actions.map((action) => (action.kind === "call" ? "" : actionLine(action)))).toEqual([
        "Starts a Paperclip sign-in in the desktop app and shows its code",
        "Opens the approval page the sign-in gives, on the connection's own Paperclip",
        "Waits for your approval, then keeps the key in this computer's keychain",
        "Says who is signed in, and revokes the key of a test sign-in",
      ]);
    });
  });
});
