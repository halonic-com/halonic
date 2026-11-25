import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manualGuideFor } from "../guide.test-helper.ts";
import { definition } from "./claim-placeholder.ts";

const parameters = { package: "acme-app" };

verifies("action-catalog.npm-claim-placeholder", () => {
  describe("npm.claim-placeholder@1", () => {
    it("is one guided step on the package's page on www.npmjs.com", () => {
      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0]).toMatchObject({
        kind: "guided",
        address: "https://www.npmjs.com/package/{package}",
      });
    });

    it("previews the name in one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the npm page for acme-app, then you publish an empty first version from your terminal to claim the name. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "npm", kind: "package", name: "acme-app" },
      ]);
    });

    it("gives a numbered manual guide that opens the package page", () => {
      const guide = manualGuideFor("npm.claim-placeholder@1", parameters);
      expect(guide).toContain("1. Open https://www.npmjs.com/package/acme-app\n");
      expect(guide).toContain("4. In an empty folder, run `npm init -y`");
      expect(guide.split("\n").filter((line) => /^\d+\. /.test(line))).toHaveLength(7);
    });

    it.each(["../acme", "acme%2Fapp", "acme?x=1", "@acme/app", "Acme"])(
      "refuses the package %s",
      (name) => {
        expect(parse(definition.parameters, { package: name }).ok).toBe(false);
      },
    );
  });
});
