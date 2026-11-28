import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { addressesOffOrigin, guidedAddresses } from "../guided-test-support.ts";
import { acceptedValueNames } from "../value-fields.test-helper.ts";
import { definition } from "./add-project-repository.ts";

const parameters = {
  host: "paperclip.acme.example",
  company: "ACME",
  project: "new-app",
  owner: "acme",
  repo: "new-app",
};

verifies("action-catalog.paperclip-add-project-repository", () => {
  describe("paperclip.add-project-repository@1", () => {
    it("is one admin guided step on the project's page of the host it names, with no call", () => {
      expect(definition.risk).toBe("admin");
      expect(definition.steps.map((step) => step.kind)).toEqual(["guided"]);
      const addresses = guidedAddresses(definition, parameters);
      expect(addresses).toEqual(["https://paperclip.acme.example/ACME/projects/new-app"]);
      expect(addressesOffOrigin(addresses, ["paperclip.acme.example"])).toEqual([]);
    });

    it("refuses a value next to its parameters, and a project or repository that could reach another page", () => {
      expect(parse(definition.parameters, parameters).ok).toBe(true);
      expect(acceptedValueNames(definition, parameters)).toEqual([]);
      for (const change of [
        { project: "../settings" },
        { project: "New-App" },
        { host: "paperclip.acme.example/evil" },
        { repo: "new-app?x=1" },
      ]) {
        expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
      }
    });

    it("previews the project and the repository", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the project new-app of ACME on paperclip.acme.example, where you add the repository acme/new-app as a workspace. Its agents work in it from their next run.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "paperclip", kind: "Paperclip", name: "paperclip.acme.example" },
        { service: "paperclip", kind: "project", name: "new-app" },
      ]);
    });
  });
});
