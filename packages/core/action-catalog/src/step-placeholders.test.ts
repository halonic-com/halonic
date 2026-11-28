import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { secretGuided, secretSavedCheck } from "./github/set-actions-secret.ts";
import { withPlaceholders } from "./step-placeholders.ts";

verifies("action-catalog.github-create-repository", () => {
  describe("withPlaceholders", () => {
    it("renames every placeholder at once, so a renamed one isn't renamed again", () => {
      const check = withPlaceholders(secretSavedCheck, { repo: "name", name: "secret" });
      expect(check.path).toBe("/repos/{owner}/{name}/actions/secrets/{secret}");
      expect(check.manual.url).toBe("https://github.com/{owner}/{name}/settings/secrets/actions");
      expect(check.manual.instructions[0]).toContain("Check that {secret} is listed");
    });

    it("keeps field names and the reviewed step itself unchanged", () => {
      const guided = withPlaceholders(secretGuided, { repo: "name", name: "secret" });
      expect(guided.instructions[0]).toContain("find {secret}");
      expect(withPlaceholders(secretSavedCheck, { name: "secret" }).keep).toEqual([
        "name",
        "updated_at",
      ]);
      expect(secretSavedCheck.path).toBe("/repos/{owner}/{repo}/actions/secrets/{name}");
      const withValues = withPlaceholders(
        { ...secretSavedCheck, requires: [{ name: "name", equals: 7, reason: "{other} stays" }] },
        { name: "secret" },
      );
      expect(withValues.requires).toEqual([{ name: "name", equals: 7, reason: "{other} stays" }]);
    });
  });
});
