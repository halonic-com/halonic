import { describe, expect, expectTypeOf, test } from "vitest";
import { runTypeChecks, typeTest } from "./type-test.ts";
import { verifies } from "./verifies.ts";

verifies("spec.type-test-marks-type-only", () => {
  // The last test reads the tag of the first, so they keep their order.
  describe("in order", { shuffle: false }, () => {
    typeTest("only checks types", () => {
      expectTypeOf<"a">().toEqualTypeOf<"a">();
    });

    // The preset turns on requireAssertions, so an empty test still fails.
    test.fails("a plain test with no assertion", () => {});

    test("fails a typeTest body that calls expect", () => {
      expect(() =>
        runTypeChecks("calls expect", () => {
          expect(1).toBe(1);
        }),
      ).toThrow(/use it\(\) instead/);
    });

    test("records one assertion for a typeTest", ({ task }) => {
      const sibling = task.suite?.tasks.find((t) => t.name === "only checks types");
      expect(sibling?.result?.state).toBe("pass");
      expect(sibling?.meta.assertions).toBe(1);
    });
  });
});
