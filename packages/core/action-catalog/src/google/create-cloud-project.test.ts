import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { consoleStepProblems, manualGuideOf, numberedLines } from "../guided-checks.ts";
import { definition } from "./create-cloud-project.ts";

const parameters = { projectId: "acme-prod" };

verifies("action-catalog.google-create-cloud-project", () => {
  describe("google.create-cloud-project@1", () => {
    it("opens only https pages on console.cloud.google.com, with docs-checked instructions and no secret result", () => {
      expect(consoleStepProblems(definition, "console.cloud.google.com")).toEqual([]);
    });

    it("gives a numbered manual guide that starts with the page address", () => {
      const lines = numberedLines(manualGuideOf(definition, parameters));
      expect(lines[0]).toMatch(/^1\. Open https:\/\/console\.cloud\.google\.com\//);
      expect(lines.length).toBeGreaterThan(2);
    });

    it("takes the project id back as a non-secret result with the project id pattern", () => {
      expect(definition.steps[0]).toMatchObject({
        result: { label: "the project id", pattern: "^[a-z][a-z0-9-]{5,29}$" },
      });
    });

    it("previews the project in one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the Google Cloud console, where you create the project acme-prod by hand and paste its project id back. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "google", kind: "cloud project", name: "acme-prod" },
      ]);
    });

    it("opens the project creation page in the manual guide", () => {
      expect(manualGuideOf(definition, parameters)).toContain(
        "1. Open https://console.cloud.google.com/projectcreate",
      );
    });

    it.each(["Acme_Prod", "acme", "1acme-prod", "acme-prod/../x", "acme.prod"])(
      "refuses the project id %s",
      (projectId) => {
        expect(parse(definition.parameters, { projectId }).ok).toBe(false);
      },
    );

    it("refuses an undeclared key", () => {
      expect(parse(definition.parameters, { ...parameters, path: "x" }).ok).toBe(false);
    });
  });
});
