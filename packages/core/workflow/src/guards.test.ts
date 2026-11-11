import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { evaluateGuard } from "./guards.ts";

verifies("workflow.guard", () => {
  const scope = { input: {}, context: { tags: ["a", "b"], text: "Hello World" } };

  // Ported from "guards" › "evaluates nested guards" at 784f78d.
  it("evaluates nested guards", () => {
    expect(evaluateGuard({ contains: ["{{context.tags}}", "b"] }, scope)).toBe(true);
    expect(evaluateGuard({ contains: ["{{context.text}}", "world"] }, scope)).toBe(true);
    expect(
      evaluateGuard(
        { all: [{ exists: "context.text" }, { not: { exists: "context.nope" } }] },
        scope,
      ),
    ).toBe(true);
    // exists also takes the path written as a placeholder.
    expect(evaluateGuard({ exists: "{{context.text}}" }, scope)).toBe(true);
    expect(evaluateGuard({ exists: "{{ context.nope }}" }, scope)).toBe(false);
    expect(evaluateGuard({ any: [{ equals: [1, 2] }, { notEquals: [1, 2] }] }, scope)).toBe(true);
  });

  // New: the cases below pin down each rule of the old guards.ts on its own.
  it("compares texts without the spaces around them, and other values by their JSON", () => {
    expect(evaluateGuard({ equals: [" yes\n", "yes"] }, scope)).toBe(true);
    expect(evaluateGuard({ equals: ["Yes", "yes"] }, scope)).toBe(false);
    expect(evaluateGuard({ equals: ["{{context.tags}}", ["a", "b"]] }, scope)).toBe(true);
    expect(evaluateGuard({ equals: [1, "1"] }, scope)).toBe(false);
    expect(evaluateGuard({ notEquals: ["{{context.text}}", "Hello World "] }, scope)).toBe(false);
  });

  it("lets a missing value equal nothing, not even another missing value", () => {
    expect(evaluateGuard({ equals: ["{{context.nope}}", "{{context.gone}}"] }, scope)).toBe(false);
    expect(evaluateGuard({ equals: ["{{context.nope}}", "{{context.nope}}"] }, scope)).toBe(false);
    expect(evaluateGuard({ equals: ["{{context.nope}}", "yes"] }, scope)).toBe(false);
    expect(evaluateGuard({ notEquals: ["{{context.nope}}", "{{context.gone}}"] }, scope)).toBe(
      true,
    );
  });

  it("finds a value in a list by the same rule, and nothing in other values", () => {
    expect(evaluateGuard({ contains: ["{{context.tags}}", " a "] }, scope)).toBe(true);
    expect(evaluateGuard({ contains: ["{{context.tags}}", "A"] }, scope)).toBe(false);
    expect(evaluateGuard({ contains: ["{{context.text}}", 1] }, scope)).toBe(false);
    expect(evaluateGuard({ contains: [42, 4] }, scope)).toBe(false);
    expect(evaluateGuard({ contains: ["{{context.nope}}", "a"] }, scope)).toBe(false);
  });

  it("counts null and empty text as not existing", () => {
    const empty = { context: { none: null, blank: "", zero: 0, no: false } };
    expect(evaluateGuard({ exists: "context.none" }, empty)).toBe(false);
    expect(evaluateGuard({ exists: "context.blank" }, empty)).toBe(false);
    expect(evaluateGuard({ exists: "context.zero" }, empty)).toBe(true);
    expect(evaluateGuard({ exists: "context.no" }, empty)).toBe(true);
  });

  it("needs every guard for all and one for any, so an empty all passes and an empty any fails", () => {
    expect(evaluateGuard({ all: [] }, scope)).toBe(true);
    expect(evaluateGuard({ any: [] }, scope)).toBe(false);
    expect(
      evaluateGuard({ all: [{ exists: "context.text" }, { exists: "context.nope" }] }, scope),
    ).toBe(false);
  });
});

verifies("workflow.number-guard", () => {
  const scope = { context: { amount: "EUR 1.250,00", small: 999.5, text: "n/a" } };

  // Ported from "number guards" › "compares numbers, also written as money" at 784f78d.
  it("compares numbers, also written as money", () => {
    expect(evaluateGuard({ gte: ["{{context.amount}}", 1000] }, scope)).toBe(true);
    expect(evaluateGuard({ gt: ["{{context.amount}}", 10000] }, scope)).toBe(false);
    expect(evaluateGuard({ lt: ["{{context.small}}", 1000] }, scope)).toBe(true);
    expect(evaluateGuard({ lte: [1000, "1,000.00"] }, scope)).toBe(true);
    // Not a number: the guard is false either way.
    expect(evaluateGuard({ gt: ["{{context.text}}", 0] }, scope)).toBe(false);
    expect(evaluateGuard({ lt: ["{{context.text}}", 0] }, scope)).toBe(false);
  });

  // New.
  it("keeps the edges apart: gt and lt fail on equal numbers, gte and lte pass", () => {
    expect(evaluateGuard({ gt: [5, 5] }, scope)).toBe(false);
    expect(evaluateGuard({ gte: [5, 5] }, scope)).toBe(true);
    expect(evaluateGuard({ lt: [5, 5] }, scope)).toBe(false);
    expect(evaluateGuard({ lte: [5, 5] }, scope)).toBe(true);
  });

  it("fails when the number on the right side is missing", () => {
    expect(evaluateGuard({ lte: [0, "{{context.missing}}"] }, scope)).toBe(false);
    expect(evaluateGuard({ not: { lte: [0, "{{context.missing}}"] } }, scope)).toBe(true);
  });
});
