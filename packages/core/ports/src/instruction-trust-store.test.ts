import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type InstructionTrustKey,
  type InstructionTrustRecord,
  type InstructionTrustStore,
  instructionTrustKey,
  isInstructionTrustFor,
} from "./index.ts";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const record: InstructionTrustRecord = {
  location: "/workspaces/acme",
  agent: "coder",
  pin: { digest: digest("a"), files: { "AGENTS.md": digest("b") } },
  grantedAt: "2026-11-15T10:00:00.000Z",
};

verifies("ports.instruction-trust-store", () => {
  typeTest("only stores records: get, save and remove", () => {
    expectTypeOf<keyof InstructionTrustStore>().toEqualTypeOf<"get" | "save" | "remove">();
    expectTypeOf<InstructionTrustStore["get"]>().parameters.toEqualTypeOf<
      [key: InstructionTrustKey]
    >();
    expectTypeOf<InstructionTrustStore["get"]>().returns.toEqualTypeOf<
      Promise<InstructionTrustRecord | null>
    >();
    expectTypeOf<InstructionTrustStore["save"]>().parameters.toEqualTypeOf<
      [record: InstructionTrustRecord]
    >();
    expectTypeOf<InstructionTrustStore["remove"]>().parameters.toEqualTypeOf<
      [key: InstructionTrustKey]
    >();
  });

  it("holds the pin and belongs to one agent", () => {
    // @ts-expect-error: a record is for the instructions it pins
    const unpinned: InstructionTrustRecord = { ...record, pin: undefined };
    // @ts-expect-error: a record belongs to one agent
    const unkeyed: InstructionTrustRecord = { ...record, agent: undefined };
    expect([unpinned, unkeyed]).toHaveLength(2);
  });

  const key: InstructionTrustKey = { location: record.location, agent: record.agent };

  it("keys an agent by its hub and id, so the same id in two hubs gets two keys", () => {
    const support = instructionTrustKey("/workspaces/acme", "support", "coder");
    const sales = instructionTrustKey("/workspaces/acme", "sales", "coder");

    expect(support).toEqual({ location: "/workspaces/acme", agent: "support/coder" });
    expect(sales).toEqual({ location: "/workspaces/acme", agent: "sales/coder" });
    expect(isInstructionTrustFor(sales, { ...record, ...support })).toBe(false);
  });

  it("accepts a record for the key it is asked about", () => {
    expect(isInstructionTrustFor(key, structuredClone(record))).toBe(true);
  });

  it("accepts a pin with no files", () => {
    expect(isInstructionTrustFor(key, { ...record, pin: { ...record.pin, files: {} } })).toBe(true);
  });

  it.each([
    ["nothing", null],
    ["text", "trusted"],
    ["an array", []],
    ["no pin", { ...record, pin: undefined }],
    ["a pin that isn't an object", { ...record, pin: "sha256:" }],
    ["a time that isn't text", { ...record, grantedAt: 0 }],
    ["an extra field", { ...record, trusted: true }],
    ["another agent's key", { ...record, agent: "writer" }],
    ["another workspace's key", { ...record, location: "/workspaces/other" }],
    ["an extra pin field", { ...record, pin: { ...record.pin, note: "x" } }],
    ["a set digest not in sha256 form", { ...record, pin: { ...record.pin, digest: "sha256:00" } }],
    [
      "a file digest in another form",
      { ...record, pin: { ...record.pin, files: { "AGENTS.md": `md5:${"a".repeat(32)}` } } },
    ],
    [
      "a file digest in upper case",
      { ...record, pin: { ...record.pin, files: { "AGENTS.md": digest("B") } } },
    ],
    ["files that are an array", { ...record, pin: { ...record.pin, files: [digest("b")] } }],
    ["a file digest that isn't text", { ...record, pin: { ...record.pin, files: { "A.md": 1 } } }],
  ])("refuses %s", (_kind, value) => {
    expect(isInstructionTrustFor(key, value)).toBe(false);
  });

  it("refuses a field it only inherits, even with the right number of fields", () => {
    const { grantedAt, ...rest } = record;
    const inherited = Object.assign(Object.create({ grantedAt }), rest, { extra: "x" });
    expect(isInstructionTrustFor(key, inherited)).toBe(false);
  });
});
