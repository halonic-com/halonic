import { describe, expect, it } from "vitest";
import { closestName, editDistance } from "./closest-name.ts";

describe("editDistance", () => {
  it("counts inserts, deletes and swapped letters", () => {
    expect(editDistance("test", "test")).toBe(0);
    expect(editDistance("tset", "test")).toBe(2);
    expect(editDistance("tes", "test")).toBe(1);
    expect(editDistance("tests", "test")).toBe(1);
    expect(editDistance("", "run")).toBe(3);
    expect(editDistance("deploy", "doctor")).toBe(4);
  });
});

describe("closestName", () => {
  const names = ["init", "validate", "test", "run", "runs", "trust", "doctor", "schema"];

  it("guesses the one name within two edits", () => {
    expect(closestName("tset", names)).toBe("test");
    expect(closestName("schem", names)).toBe("schema");
  });

  it("doesn't guess when no name is close", () => {
    expect(closestName("deploy", names)).toBeUndefined();
  });

  it("doesn't guess when more than one name is close", () => {
    expect(closestName("rn", names)).toBeUndefined();
  });
});
