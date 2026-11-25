import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manualGuideFor } from "../guide.test-helper.ts";
import { definition } from "./set-trusted-publisher.ts";

const parameters = {
  scope: "acme",
  package: "app",
  owner: "acme",
  repo: "app",
  workflow: "publish.yml",
  environment: "release",
};

verifies("action-catalog.npm-set-trusted-publisher", () => {
  describe("npm.set-trusted-publisher@1", () => {
    it("is one guided step on the package's access page on www.npmjs.com", () => {
      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0]).toMatchObject({
        kind: "guided",
        address: "https://www.npmjs.com/package/@{scope}/{package}/access",
      });
    });

    it("previews the package and workflow in one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the access settings of @acme/app on npm, where you let acme/app publish it from publish.yml by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "npm", kind: "package", name: "@acme/app" },
      ]);
    });

    it("gives a numbered manual guide that opens the access page", () => {
      const guide = manualGuideFor("npm.set-trusted-publisher@1", parameters);
      expect(guide).toContain("1. Open https://www.npmjs.com/package/@acme/app/access\n");
      expect(guide).toContain("5. Fill in **Workflow filename** with `publish.yml`");
      expect(guide).toContain("6. Fill in **Environment name** with `release`");
      expect(guide.split("\n").filter((line) => /^\d+\. /.test(line))).toHaveLength(9);
    });

    it("is refused as a request when the workflow file is a path", () => {
      expect(() =>
        manualGuideFor("npm.set-trusted-publisher@1", {
          ...parameters,
          workflow: ".github/workflows/publish.yml",
        }),
      ).toThrow();
    });

    it.each(["../x.yml", ".github/workflows/publish.yml", "publish.sh", "Publish.yml", "a b.yml"])(
      "refuses the workflow file %s",
      (workflow) => {
        expect(parse(definition.parameters, { ...parameters, workflow }).ok).toBe(false);
      },
    );

    it.each(["../app", "app%2Fx", "app?x=1"])("refuses the package %s", (name) => {
      expect(parse(definition.parameters, { ...parameters, package: name }).ok).toBe(false);
    });
  });
});
