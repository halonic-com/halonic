import { routesOf } from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manualGuideFor } from "../guide.test-helper.ts";
import { definition } from "./approve-staged-version.ts";

const commit = "4f2c9e1b7a3d5c8e0f6a2b4d9c1e7f3a5b8d0c2e";
const parameters = { scope: "acme", package: "app", version: "1.4.0", commit, ref_name: "v1.4.0" };

verifies("action-catalog.npm-approve-staged-version", () => {
  describe("npm.approve-staged-version@1", () => {
    it("opens only npm's own pages, with no API step", () => {
      expect(routesOf(definition)).toMatchObject([
        {
          step: 1,
          kind: "guided",
          address: "https://www.npmjs.com/settings/~/staged-packages",
        },
        {
          step: 2,
          kind: "guided",
          address: "https://www.npmjs.com/package/@{scope}/{package}/v/{version}",
        },
      ]);
    });

    it("says it makes the version public and that Halonic can't check it", () => {
      expect(definition.risk).toBe("irreversible");
      expect(definition.preview(parameters)).toEqual([
        "Opens your staged packages on npm, where you check that @acme/app 1.4.0 was built from commit `4f2c9e1b7a3d5c8e0f6a2b4d9c1e7f3a5b8d0c2e` on a ref that ends in `v1.4.0` and approve it with your second factor. This makes the version public and can't be undone. Halonic can't check it.",
        "Opens the page of @acme/app 1.4.0 on npm, where you check that it's public. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "npm", kind: "package version", name: "@acme/app@1.4.0" },
      ]);
    });

    it("gives a numbered manual guide that ends on the version's npm page", () => {
      const guide = manualGuideFor("npm.approve-staged-version@1", parameters, "Release 1.4.0");
      expect(guide).toContain("https://www.npmjs.com/package/");
      expect(guide).toBe(
        [
          "`Release 1.4.0`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://www.npmjs.com/settings/~/staged-packages",
          "2. Sign in to npm with an account that maintains @`acme`/`app`, if npm asks you to.",
          "3. If the page doesn't show your staged packages, open your account's **Settings** and click **Staged Packages**.",
          "4. Find @`acme`/`app` version `1.4.0`. If it isn't listed, stop: the release workflow didn't stage it, or someone already approved or rejected it.",
          `5. Open its provenance and check that it was built from commit \`${commit}\`, on a ref that ends in \`v1.4.0\`. If either differs, click **Reject** instead and stop.`,
          "6. Click **Approve**, then confirm with your second factor (2FA).",
          "7. Open https://www.npmjs.com/package/@acme/app/v/1.4.0",
          "8. Check that the page shows version `1.4.0`. A version npm hasn't made public yet has no page, so reload after a minute if it says it's not found.",
          "",
        ].join("\n"),
      );
    });

    it("says its steps come from npm's documentation, not a walk on the live page", () => {
      for (const step of definition.steps) expect(step).toMatchObject({ checkedOn: "from docs" });
    });

    it("takes a pre-release version", () => {
      expect(parse(definition.parameters, { ...parameters, version: "1.4.0-rc.1" }).ok).toBe(true);
    });

    it.each([
      { version: "1.4" },
      { version: "1.4.0+build.7" },
      { version: "../1.4.0" },
      { scope: "@acme" },
      { package: "acme/app" },
      { commit: "4f2c9e1" },
      { ref_name: "refs/tags/v1.4.0" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
