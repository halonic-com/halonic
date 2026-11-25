import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  addressesOffOrigin,
  guidedAddresses,
  manualGuideOf,
  secretFields,
} from "../guided-test-support.ts";
import { definition } from "./set-nameservers.ts";

const parameters = {
  registrar: "porkbun.com",
  domain: "acme.example",
  nameserverOne: "ada.ns.cloudflare.com",
  nameserverTwo: "bob.ns.cloudflare.com",
};
// The service's declared web origin(s): a step may open nothing else.
const origins = ["ap.www.namecheap.com", "dcc.godaddy.com", "porkbun.com"];

verifies("action-catalog.registrar-set-nameservers", () => {
  describe("registrar.set-nameservers@1", () => {
    it("opens only https pages on the declared web origin", () => {
      expect(guidedAddresses(definition, parameters)).not.toEqual([]);
      expect(addressesOffOrigin(guidedAddresses(definition, parameters), origins)).toEqual([]);
    });

    it("has only guided steps", () => {
      for (const step of definition.steps) {
        expect(step.kind).toBe("guided");
      }
    });

    it("has no result or input that could hold a secret", () => {
      expect(secretFields(definition)).toEqual([]);
    });

    it("previews one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens porkbun.com, where you set the nameservers of acme.example to ada.ns.cloudflare.com and bob.ns.cloudflare.com by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "registrar", kind: "domain", name: "acme.example" },
      ]);
    });

    it("gives a numbered manual guide that holds the address", () => {
      const guide = manualGuideOf(definition, parameters, "Move acme.example to Cloudflare");
      expect(guide).toBe(
        [
          "`Move acme.example to Cloudflare`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://porkbun.com/",
          "2. Sign in to your registrar if the page asks, and open the list of your domains.",
          "3. Open `acme.example` and find its nameserver setting. It's called **Nameservers**, **DNS servers** or **Custom DNS**.",
          "4. Choose the custom option (not the registrar's default) and replace every nameserver with these two: `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`.",
          "5. Save. Check that the page now lists exactly those two and no others.",
          "6. Changes can take up to 24 hours to spread; Cloudflare shows the zone as **Active** when it sees them.",
          "",
        ].join("\n"),
      );
      expect(guide).toContain("1. Open https://porkbun.com/");
    });

    it.each([
      { registrar: "evil.example" },
      { domain: "acme.example/../x" },
      { nameserverOne: "ada.ns.cloudflare.com.evil.example" },
      { nameserverTwo: "ada.example.com" },
    ])("refuses %j", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });

    it("refuses an undeclared key", () => {
      expect(parse(definition.parameters, { ...parameters, path: "x" }).ok).toBe(false);
    });
  });
});
