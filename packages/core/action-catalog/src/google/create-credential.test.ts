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
import { definition } from "./create-credential.ts";

const parameters = { projectId: "acme-prod", keyName: "acme-maps" };

verifies("action-catalog.google-create-credential", () => {
  describe("google.create-credential@1", () => {
    it("has one guided step on console.cloud.google.com, with no paste-back and no input", () => {
      expect(definition.steps.map((step) => step.kind)).toEqual(["guided"]);
      expect(
        addressesOffOrigin(guidedAddresses(definition, parameters), ["console.cloud.google.com"]),
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
        "Opens the credentials page of the Google Cloud console, where you create the restricted API key acme-maps in acme-prod and copy it. Halonic never sees it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "google", kind: "cloud project", name: "acme-prod" },
        { service: "google", kind: "API key", name: "acme-maps" },
      ]);
    });

    it("gives a manual guide that names the key page and has no value field", () => {
      const guide = manualGuideOf(definition, parameters, "Set up acme");
      expect(guide).toBe(
        [
          "`Set up acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://console.cloud.google.com/apis/credentials",
          "2. Sign in to Google Cloud with your own account if the page asks.",
          "3. In the project picker at the top, choose the project `acme-prod`.",
          "4. Click **Create credentials**, then **API key**.",
          "5. In the dialog, click **Edit API key**, type `acme-maps` as its **Name**, and under **API restrictions** choose **Restrict key** and tick only the APIs this key is for.",
          "6. Click **Save**, then **Show key** on the key's row.",
          `7. ${keepTheKeyLine}`,
          "",
        ].join("\n"),
      );
      expect(guide).not.toMatch(/paste (?:it|the key) here|\{value\}/i);
    });
  });
});
