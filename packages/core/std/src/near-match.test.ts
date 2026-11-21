import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { editDistance, nearMatch } from "./near-match.ts";

verifies("std.near-match", () => {
  it("finds the one name within two edits", () => {
    expect(nearMatch("soter", ["writer", "sorter"])).toBe("sorter");
    expect(nearMatch("ignore", ["read", "replied", "ignored"])).toBe("ignored");
  });

  it("guesses nothing when no name is near", () => {
    expect(nearMatch("xyz", ["writer", "sorter"])).toBeUndefined();
    expect(nearMatch("soter", [])).toBeUndefined();
  });

  it("guesses nothing when two names are near", () => {
    expect(nearMatch("rn", ["run", "runs"])).toBeUndefined();
  });

  it("counts a name given twice once", () => {
    expect(nearMatch("soter", ["sorter", "sorter"])).toBe("sorter");
  });
});

verifies("std.near-match-spellings", () => {
  const optionStem = (name: string) => (name.startsWith("--no-") ? [`--${name.slice(5)}`] : []);

  it("finds a name by another spelling the caller gives for it", () => {
    expect(nearMatch("--colour", ["--json", "--no-color"], { spellingsOf: optionStem })).toBe(
      "--no-color",
    );
  });

  it("finds nothing by a spelling the caller didn't give", () => {
    expect(nearMatch("--colour", ["--json", "--no-color"])).toBeUndefined();
  });
});

describe("editDistance", () => {
  it("counts a swap of two neighbours as one edit", () => {
    expect(editDistance("nmae", "name")).toBe(1);
    expect(editDistance("tset", "test")).toBe(1);
  });

  it("counts insertions, deletions and substitutions", () => {
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "")).toBe(3);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});
