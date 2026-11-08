import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { rules, rulesAfterTests, selectRules } from "./all.ts";

verifies("check.trace-runs-only-when-named", () => {
  test("plain pnpm check runs every rule except trace", () => {
    const chosen = selectRules([]);
    expect(rulesAfterTests).toEqual(["trace"]);
    expect(chosen).not.toContain("trace");
    expect(chosen).toEqual(Object.keys(rules).filter((name) => name !== "trace"));
  });

  test("named rules run, trace included", () => {
    expect(selectRules(["trace"])).toEqual(["trace"]);
    expect(selectRules(["layers", "trace"])).toEqual(["layers", "trace"]);
  });
});
