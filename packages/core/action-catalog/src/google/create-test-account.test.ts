import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  addressesOffOrigin,
  guidedAddresses,
  manualGuideOf,
  secretFields,
} from "../guided-test-support.ts";
import { definition } from "./create-test-account.ts";

const parameters = {};
// The service's declared web origin(s): a step may open nothing else.
const origins = ["accounts.google.com"];

verifies("action-catalog.google-create-test-account", () => {
  describe("google.create-test-account@1", () => {
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
        "Opens Google's sign-up page, where you create a test account and pass the phone check by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "google", kind: "page", name: "accounts.google.com/signup" },
      ]);
    });

    it("gives a numbered manual guide that holds the address", () => {
      const guide = manualGuideOf(definition, parameters, "Create the acme test account");
      expect(guide).toBe(
        [
          "`Create the acme test account`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://accounts.google.com/signup",
          "2. Fill in the name and choose **Next**; use a test name such as `Acme Test`, not a real person's.",
          "3. Enter a birthday and choose **Next**.",
          "4. Choose or type the new address, then choose **Next**.",
          "5. Create a password and keep it in your password manager; never paste it here.",
          "6. If Google asks to verify your phone, enter your number and the code Google sends you yourself.",
          "7. Finish with **I agree**, then check that you are signed in to the new account.",
          "8. Copy the new account's address from the page and paste it back on the card.",
          "",
        ].join("\n"),
      );
      expect(guide).toContain("1. Open https://accounts.google.com/signup");
    });

    it("refuses an undeclared key", () => {
      expect(parse(definition.parameters, { ...parameters, path: "x" }).ok).toBe(false);
    });
  });
});
