import { describe, expect, it } from "vitest";
import { copyLabel } from "./changes-merge.ts";

describe("copyLabel", () => {
  it("is the possessive of one person's name", () => {
    expect(copyLabel(["Sam"])).toBe("Sam's");
  });

  it("is plain 'shared' for more than one person, or none", () => {
    expect(copyLabel(["Sam", "Ana"])).toBe("shared");
    expect(copyLabel([])).toBe("shared");
  });

  it("replaces what a path can't hold", () => {
    expect(copyLabel(["a/b\\c:d"])).toBe("a-b-c-d's");
    expect(copyLabel(["///"])).toBe("---'s");
    expect(copyLabel(["Sam."])).toBe("Sam's");
    expect(copyLabel(["  "])).toBe("shared");
  });
});
