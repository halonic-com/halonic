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
import { definition } from "./create-token.ts";

const parameters = { keyName: "acme-dns", zone: "acme.example", permission: "DNS · Edit" };

verifies("action-catalog.cloudflare-create-token", () => {
  describe("cloudflare.create-token@1", () => {
    it("has one guided step on dash.cloudflare.com, with no paste-back and no input", () => {
      expect(definition.steps.map((step) => step.kind)).toEqual(["guided"]);
      expect(
        addressesOffOrigin(guidedAddresses(definition, parameters), ["dash.cloudflare.com"]),
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
        "Opens your Cloudflare API tokens page, where you create the token acme-dns with only Zone · DNS · Edit on acme.example and copy it. Halonic never sees it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "cloudflare", kind: "zone", name: "acme.example" },
        { service: "cloudflare", kind: "API token", name: "acme-dns" },
      ]);
    });

    it("gives a manual guide that names the key page and has no value field", () => {
      const guide = manualGuideOf(definition, parameters, "Set up acme");
      expect(guide).toBe(
        [
          "`Set up acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://dash.cloudflare.com/profile/api-tokens",
          "2. Sign in to Cloudflare with your own account if the page asks.",
          "3. Click **Create Token**, then next to **Create Custom Token** click **Get started**.",
          "4. Type `acme-dns` as the **Token name**.",
          "5. Under **Permissions**, choose **Zone**, then `DNS · Edit`. Add no other permission.",
          "6. Under **Zone Resources**, choose **Include**, **Specific zone** and `acme.example`. Never **All zones**.",
          "7. Click **Continue to summary**, check it names only `acme.example`, then click **Create Token**.",
          `8. ${keepTheKeyLine}`,
          "",
        ].join("\n"),
      );
      expect(guide).not.toMatch(/paste (?:it|the key) here|\{value\}/i);
    });
  });
});
