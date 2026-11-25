import type { StepperDefinition } from "@halonicjs/action-steppers";
import { describe, expect, it } from "vitest";
import { addressesOffOrigin, guidedAddresses, secretFields } from "./guided-test-support.ts";

const base = {
  id: "acme.example",
  version: 1,
  service: "acme",
  title: "t",
  summary: "s",
  risk: "routine",
  parameters: undefined,
  targets: () => [],
  preview: () => [],
} as unknown as StepperDefinition;

const guided = (address: string, label?: string): StepperDefinition => ({
  ...base,
  steps: [
    {
      kind: "guided",
      address,
      instructions: ["Do it."],
      checkedOn: "2026-11-25",
      ...(label === undefined ? {} : { result: { label, pattern: "^x$" } }),
    },
  ],
});

// These helpers decide what the catalog's guided tests accept, so they get tests of their own.
describe("guided test support", () => {
  it("flags an address that isn't https on a listed host", () => {
    const hosts = ["acme.example"];
    expect(addressesOffOrigin(["https://acme.example/a"], hosts)).toEqual([]);
    expect(addressesOffOrigin(["http://acme.example/a"], hosts)).toHaveLength(1);
    expect(addressesOffOrigin(["https://evil.example/a"], hosts)).toHaveLength(1);
    expect(addressesOffOrigin(["https://acme.example:8443/a"], hosts)).toHaveLength(1);
    expect(addressesOffOrigin(["https://acme.example/a?x=1"], hosts)).toHaveLength(1);
  });

  it("fills placeholders when listing addresses", () => {
    expect(guidedAddresses(guided("https://acme.example/{zone}"), { zone: "a b" })).toEqual([
      "https://acme.example/a%20b",
    ]);
  });

  it("flags a secret input and a result named like a secret", () => {
    const secretInput = {
      ...base,
      steps: [{ kind: "input", name: "k", label: "Key", secret: true }],
    } as StepperDefinition;
    expect(secretFields(secretInput)).toHaveLength(1);
    expect(secretFields(guided("https://acme.example/", "the API token"))).toHaveLength(1);
    expect(secretFields(guided("https://acme.example/", "the account's address"))).toEqual([]);
    expect(secretFields(guided("https://acme.example/"))).toEqual([]);
  });
});
