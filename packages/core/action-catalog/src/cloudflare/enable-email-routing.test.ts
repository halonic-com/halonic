import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  addressesOffOrigin,
  guidedAddresses,
  manualGuideOf,
  secretFields,
} from "../guided-test-support.ts";
import { definition } from "./enable-email-routing.ts";

const parameters = { accountId: "0123456789abcdef0123456789abcdef", zone: "acme.example" };
// The service's declared web origin(s): a step may open nothing else.
const origins = ["dash.cloudflare.com"];

verifies("action-catalog.cloudflare-enable-email-routing", () => {
  describe("cloudflare.enable-email-routing@1", () => {
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
        "Opens Email Routing for acme.example in Cloudflare, where you turn it on by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "cloudflare", kind: "zone", name: "acme.example" },
      ]);
    });

    it("gives a numbered manual guide that holds the address", () => {
      const guide = manualGuideOf(definition, parameters, "Turn on email routing for acme.example");
      expect(guide).toBe(
        [
          "`Turn on email routing for acme.example`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/acme.example/email/routing",
          "2. Sign in to Cloudflare if the page asks.",
          "3. Click **Get started** (or **Enable Email Routing**).",
          "4. Read the DNS records Cloudflare lists, then click **Add records and enable**.",
          "5. Check that the page says Email Routing is **Enabled** for `acme.example`.",
          "",
        ].join("\n"),
      );
      expect(guide).toContain(
        "1. Open https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/acme.example/email/routing",
      );
    });

    it.each([
      { accountId: "../x" },
      { accountId: "0123" },
      { zone: "acme.example/../x" },
      { zone: "acme.example?x=1" },
    ])("refuses %j", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });

    it("refuses an undeclared key", () => {
      expect(parse(definition.parameters, { ...parameters, path: "x" }).ok).toBe(false);
    });
  });
});
