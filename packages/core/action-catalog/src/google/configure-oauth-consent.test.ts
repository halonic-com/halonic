import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { consoleStepProblems, manualGuideOf, numberedLines } from "../guided-checks.ts";
import { definition } from "./configure-oauth-consent.ts";

const parameters = { projectId: "acme-prod" };

verifies("action-catalog.google-configure-oauth-consent", () => {
  describe("google.configure-oauth-consent@1", () => {
    it("opens only https pages on console.cloud.google.com, with docs-checked instructions and no secret result", () => {
      expect(consoleStepProblems(definition, "console.cloud.google.com")).toEqual([]);
    });

    it("gives a numbered manual guide that starts with the page address", () => {
      const lines = numberedLines(manualGuideOf(definition, parameters));
      expect(lines[0]).toMatch(/^1\. Open https:\/\/console\.cloud\.google\.com\//);
      expect(lines.length).toBeGreaterThan(2);
    });

    it("previews the project in one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the OAuth consent screen of the Google Cloud project acme-prod, where you fill it in by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "google", kind: "cloud project", name: "acme-prod" },
      ]);
    });

    it("opens the consent screen of the project and keeps client secrets off the card", () => {
      const guide = manualGuideOf(definition, parameters);
      expect(guide).toContain(
        "1. Open https://console.cloud.google.com/auth/overview?project=acme-prod",
      );
      expect(guide).toContain("never paste its client secret on the card");
    });

    it.each(["Acme_Prod", "acme-prod&x=1", "acme-prod/../x"])(
      "refuses the project id %s",
      (projectId) => {
        expect(parse(definition.parameters, { projectId }).ok).toBe(false);
      },
    );
  });
});
