import { describe, expect, it } from "vitest";
import { declareTests, runExample } from "../examples/link-a-test-to-a-requirement.ts";

// Needs an ID that has a requirement file, so it borrows one of this package's.
declareTests("spec.verifies-tags-tests");

describe("the README example", () => {
  it("accepts a good ID and rejects a bad one", () => {
    const result = runExample();
    expect(result.goodId).toBe(true);
    expect(result.badId).toBe(false);
    expect(result.badIdMessage).toContain('"Timer_Fires" is not a requirement ID');
  });
});
