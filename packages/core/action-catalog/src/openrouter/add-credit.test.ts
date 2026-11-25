import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  addressesOffOrigin,
  guidedAddresses,
  manualGuideOf,
  secretFields,
} from "../guided-test-support.ts";
import { definition } from "./add-credit.ts";

const parameters = {};
// The service's declared web origin(s): a step may open nothing else.
const origins = ["openrouter.ai"];

verifies("action-catalog.openrouter-add-credit", () => {
  describe("openrouter.add-credit@1", () => {
    it("opens only https pages on the declared web origin", () => {
      expect(guidedAddresses(definition, parameters)).not.toEqual([]);
      expect(addressesOffOrigin(guidedAddresses(definition, parameters), origins)).toEqual([]);
    });

    it("has only guided steps", () => {
      for (const step of definition.steps) {
        expect(step.kind).toBe("guided");
      }
    });

    it("has no result or input that could hold a secret", () => {
      expect(secretFields(definition)).toEqual([]);
    });

    it("previews one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens your OpenRouter credits page, where you buy credit and pay by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "openrouter", kind: "page", name: "openrouter.ai/settings/credits" },
      ]);
    });

    it("gives a numbered manual guide that holds the address", () => {
      const guide = manualGuideOf(definition, parameters, "Add credit to acme");
      expect(guide).toBe(
        [
          "`Add credit to acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://openrouter.ai/settings/credits",
          "2. Sign in to OpenRouter with your own account if the page asks.",
          "3. Click **Add Credits**.",
          "4. Choose the amount you decide to spend and enter your payment details yourself; Halonic never sees them.",
          "5. Confirm the payment, then check that **Credits** shows the new balance.",
          "",
        ].join("\n"),
      );
      expect(guide).toContain("1. Open https://openrouter.ai/settings/credits");
    });

    it("refuses an undeclared key", () => {
      expect(parse(definition.parameters, { ...parameters, path: "x" }).ok).toBe(false);
    });
  });
});
