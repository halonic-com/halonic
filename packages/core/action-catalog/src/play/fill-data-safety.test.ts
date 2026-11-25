import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { consoleStepProblems, manualGuideOf, numberedLines } from "../guided-checks.ts";
import { definition } from "./fill-data-safety.ts";

const parameters = { developerId: "4012345678901234567", appId: "4976543210987654321" };

verifies("action-catalog.play-fill-data-safety", () => {
  describe("play.fill-data-safety@1", () => {
    it("opens only https pages on play.google.com, with docs-checked instructions and no secret result", () => {
      expect(consoleStepProblems(definition, "play.google.com")).toEqual([]);
    });

    it("gives a numbered manual guide that starts with the page address", () => {
      const lines = numberedLines(manualGuideOf(definition, parameters));
      expect(lines[0]).toMatch(/^1\. Open https:\/\/play\.google\.com\//);
      expect(lines.length).toBeGreaterThan(2);
    });

    it("previews the app in one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the Data safety form of app 4976543210987654321 in the Play Console, where you answer it by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        {
          service: "play",
          kind: "app",
          name: "developer 4012345678901234567, app 4976543210987654321",
        },
      ]);
    });

    it("opens the app's Data safety page in the manual guide", () => {
      expect(manualGuideOf(definition, parameters)).toContain(
        "1. Open https://play.google.com/console/u/0/developers/4012345678901234567/app/4976543210987654321/app-content/data-privacy-security",
      );
    });

    it.each([
      { developerId: "../1234567890", appId: "4976543210987654321" },
      { developerId: "4012345678901234567", appId: "12/../34567890" },
      { developerId: "123", appId: "4976543210987654321" },
    ])("refuses %j", (bad) => {
      expect(parse(definition.parameters, bad).ok).toBe(false);
    });
  });
});
