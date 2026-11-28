import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  acceptedValueNames,
  addressesOffOrigin,
  guidedAddresses,
  manualGuideOf,
  secretFields,
} from "../guided-test-support.ts";
import { keepTheKeyLine } from "../provider-key-parameters.ts";
import { definition } from "./create-key.ts";

const parameters = { keyName: "acme-agents" };

verifies("action-catalog.openrouter-create-key", () => {
  describe("openrouter.create-key@1", () => {
    it("has one guided step on openrouter.ai, with no paste-back and no input", () => {
      expect(definition.steps.map((step) => step.kind)).toEqual(["guided"]);
      expect(
        addressesOffOrigin(guidedAddresses(definition, parameters), ["openrouter.ai"]),
      ).toEqual([]);
      expect(secretFields(definition)).toEqual([]);
      expect(
        definition.steps.some((step) => step.kind === "guided" && step.result !== undefined),
      ).toBe(false);
    });

    it("refuses a value, secret, key or token next to its parameters", () => {
      expect(parse(definition.parameters, parameters).ok).toBe(true);
      expect(acceptedValueNames(definition, parameters)).toEqual([]);
    });

    it("previews the key's name and says Halonic never sees it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens your OpenRouter API keys page, where you create the key acme-agents and copy it. Halonic never sees it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "openrouter", kind: "API key", name: "acme-agents" },
      ]);
    });

    it("gives a manual guide that names the key page and has no value field", () => {
      const guide = manualGuideOf(definition, parameters, "Set up acme");
      expect(guide).toBe(
        [
          "`Set up acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://openrouter.ai/settings/keys",
          "2. Sign in to OpenRouter with your own account if the page asks.",
          "3. Click **Create API Key**.",
          "4. Type `acme-agents` as its **Name**. Set a **Credit limit** if you want one.",
          "5. Click **Create**.",
          `6. ${keepTheKeyLine}`,
          "",
        ].join("\n"),
      );
      expect(guide).not.toMatch(/paste (?:it|the key) here|\{value\}/i);
    });
  });
});
