import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manualGuideFor } from "../guide.test-helper.ts";
import { definition } from "./change-ruleset.ts";

const parameters = { owner: "acme", repo: "app", rulesetId: 4021 };

verifies("action-catalog.github-change-ruleset", () => {
  describe("github.change-ruleset@1", () => {
    it("is one guided admin step on the ruleset's own page", () => {
      expect(definition.risk).toBe("admin");
      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0]).toMatchObject({
        kind: "guided",
        address: "https://github.com/{owner}/{repo}/settings/rules/{rulesetId}",
      });
    });

    it("previews the ruleset in one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens ruleset 4021 of acme/app on GitHub, where you change its required checks or merge queue by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "github", kind: "ruleset", name: "acme/app #4021" },
      ]);
    });

    it("gives a numbered manual guide that opens the ruleset page", () => {
      expect(manualGuideFor("github.change-ruleset@1", parameters, "Change ruleset 4021")).toBe(
        [
          "`Change ruleset 4021`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/rules/4021",
          "2. Check that the page shows the ruleset the request names, and its **Enforcement status**.",
          "3. To change the required checks: under **Rules**, find **Require status checks to pass**, then add checks with **Add checks** or remove one with its trash icon.",
          "4. To change the merge queue: under **Rules**, find **Require merge queue** and change its settings.",
          "5. Click **Save changes** at the bottom of the page.",
          "",
        ].join("\n"),
      );
    });

    it.each([{ rulesetId: 0 }, { rulesetId: "4021/../1" }, { repo: "../secrets" }, { path: "x" }])(
      "refuses %o",
      (change) => {
        expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
      },
    );
  });
});
