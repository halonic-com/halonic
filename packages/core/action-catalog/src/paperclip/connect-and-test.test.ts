import { manualFormProblems } from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manualGuideOf, secretFields } from "../guided-test-support.ts";
import { definition } from "./connect-and-test.ts";

const parameters = { host: "paperclip.acme.example", connection: "acme", mode: "test" };

verifies("action-catalog.paperclip-connect-and-test", () => {
  describe("paperclip.connect-and-test@1", () => {
    it("is the four parts of Paperclip's own sign-in, in order, and nothing else", () => {
      expect(
        definition.steps.map((step) => (step.kind === "sign-in" ? step.phase : step.kind)),
      ).toEqual(["start", "approve", "keep", "test"]);
      expect(definition.risk).toBe("admin");
      expect(secretFields(definition)).toEqual([]);
      expect(manualFormProblems(definition)).toEqual([]);
    });

    it("previews each part for a test sign-in, and leaves the key for a connect", () => {
      expect(definition.preview(parameters)).toEqual([
        "Starts a board sign-in to paperclip.acme.example for the connection acme, and shows its code for 10 minutes.",
        "Opens the approval page on paperclip.acme.example, where you check the code and click Approve.",
        "Waits for your approval, then keeps the new board key in this computer's keychain.",
        "Shows who the key signs in as, then revokes this test key and removes it from the keychain.",
      ]);
      expect(definition.preview({ ...parameters, mode: "connect" })[3]).toBe(
        "Shows who the key signs in as.",
      );
      expect(definition.targets(parameters)).toEqual([
        { service: "paperclip", kind: "Paperclip", name: "paperclip.acme.example" },
        { service: "paperclip", kind: "connection", name: "acme" },
      ]);
    });

    it("gives a numbered manual guide that opens the connection's own Paperclip once", () => {
      const guide = manualGuideOf(definition, parameters, "Test a sign-in to acme");
      expect(guide).toBe(
        [
          "`Test a sign-in to acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://paperclip.acme.example/",
          "2. Check that the address matches the one in **Settings › Connections**.",
          "3. In Studio, open **Settings › Connections**, find `acme` and click **Sign in**. Studio shows a short code and a 10-minute countdown.",
          "4. On the approval page Studio opens on this Paperclip, sign in as a board member if it asks.",
          "5. Check the code matches the one Studio shows, then click **Approve**.",
          "6. Keep Studio open until it says `acme` is connected. Closing it before then cancels the sign-in.",
          "7. In **Settings › Connections**, check which account `acme` is signed in as.",
          "8. For a test sign-in, click **Disconnect** there (**Studio › Settings › Connections › Disconnect**). It revokes the key, so Paperclip no longer accepts it.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { host: "paperclip.acme.example/../x" },
      { host: "paperclip.acme.example:8443" },
      { host: "https://paperclip.acme.example" },
      { host: "localhost" },
      { host: "Paperclip.Acme.Example" },
      { connection: "../acme" },
      { connection: "-acme" },
      { mode: "revoke" },
    ])("refuses %j", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });

    it("refuses an undeclared key", () => {
      expect(parse(definition.parameters, { ...parameters, address: "x" }).ok).toBe(false);
    });
  });
});
