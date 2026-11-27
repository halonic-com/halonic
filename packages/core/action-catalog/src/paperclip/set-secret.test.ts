import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  addressesOffOrigin,
  guidedAddresses,
  manualGuideOf,
  secretFields,
} from "../guided-test-support.ts";
import { acceptedValueNames } from "../value-fields.test-helper.ts";
import { definition } from "./set-secret.ts";

const parameters = { host: "paperclip.acme.example", company: "ACME", name: "ANTHROPIC_API_KEY" };

verifies("action-catalog.paperclip-set-secret", () => {
  describe("paperclip.set-secret@1", () => {
    it("is one admin guided step on the connection's own Secrets page, with no paste-back and no input", () => {
      expect(definition.risk).toBe("admin");
      expect(definition.steps.map((step) => step.kind)).toEqual(["guided"]);
      expect(guidedAddresses(definition, parameters)).toEqual([
        "https://paperclip.acme.example/ACME/company/settings/secrets",
      ]);
      expect(
        addressesOffOrigin(guidedAddresses(definition, parameters), ["paperclip.acme.example"]),
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

    it("refuses a host or secret name that could reach another page", () => {
      for (const host of [
        "paperclip.acme.example/evil",
        "acme.example:8080",
        "user@acme.example",
      ]) {
        expect(parse(definition.parameters, { ...parameters, host }).ok).toBe(false);
      }
      for (const company of ["ACME/..", "AC ME", ""]) {
        expect(parse(definition.parameters, { ...parameters, company }).ok).toBe(false);
      }
      for (const name of ["anthropic_api_key", "../KEY", "KEY?x=1"]) {
        expect(parse(definition.parameters, { ...parameters, name }).ok).toBe(false);
      }
    });

    it("previews the secret's name and says Halonic never sees the value", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the Secrets page of ACME on paperclip.acme.example, where you paste the value of ANTHROPIC_API_KEY yourself. Halonic never sees it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "paperclip", kind: "Paperclip", name: "paperclip.acme.example" },
        { service: "paperclip", kind: "secret", name: "ANTHROPIC_API_KEY" },
      ]);
    });

    it("gives a manual guide for creating or rotating the one named secret", () => {
      expect(manualGuideOf(definition, parameters, "Set up acme")).toBe(
        [
          "`Set up acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://paperclip.acme.example/ACME/company/settings/secrets",
          "2. Sign in to this Paperclip as a board member if the page asks.",
          "3. If `ANTHROPIC_API_KEY` is listed, open it and click **Update value**, paste the value into **New value**, and click **Update value**.",
          "4. If it isn't listed, click **New secret**. Under **Who provides the value?** choose **Organization**, then **Managed value**. Type `ANTHROPIC_API_KEY` as the **Name**, paste the value into **Value**, and click **Create secret**.",
          "5. Paste the value only into that field, never into a chat, a task or a request.",
          "",
        ].join("\n"),
      );
    });
  });
});
