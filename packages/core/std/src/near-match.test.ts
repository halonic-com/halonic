import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editDistance, nearMatch } from "./near-match.ts";

verifies("std.near-match", () => {
  it("offers the one name within two edits", () => {
    expect(nearMatch("tset", ["init", "validate", "test", "run"])).toBe("test");
    expect(nearMatch("nmae", ["kind", "name"])).toBe("name");
  });

  it("offers nothing when no name is that close", () => {
    expect(nearMatch("deploy", ["init", "test", "run"])).toBeUndefined();
    expect(nearMatch("tset", [])).toBeUndefined();
  });

  it("offers nothing when two names are as close, because that guess is a coin toss", () => {
    expect(nearMatch("rux", ["run", "runs"])).toBeUndefined();
  });

  it("stops at two edits", () => {
    expect(nearMatch("tes", ["test"])).toBe("test");
    expect(nearMatch("te", ["test"])).toBe("test");
    expect(nearMatch("t", ["test"])).toBeUndefined();
  });

  it("finds a name by another spelling the caller gives, and offers the name itself", () => {
    const stemOf = (option: string) =>
      option.startsWith("--no-") ? [`--${option.slice("--no-".length)}`] : [];
    expect(nearMatch("--colour", ["--json", "--no-color"], { spellingsOf: stemOf })).toBe(
      "--no-color",
    );
    expect(nearMatch("--colour", ["--json", "--no-color"])).toBeUndefined();
  });

  it("counts a name once when it and another spelling of it are both near", () => {
    expect(nearMatch("tset", ["test"], { spellingsOf: () => ["tests"] })).toBe("test");
  });

  it("counts insertions, deletions, substitutions and swaps of neighbours as one edit each", () => {
    expect(editDistance("test", "test")).toBe(0);
    expect(editDistance("tset", "test")).toBe(1);
    expect(editDistance("tst", "test")).toBe(1);
    expect(editDistance("tesst", "test")).toBe(1);
    expect(editDistance("text", "test")).toBe(1);
    expect(editDistance("knid", "kind")).toBe(1);
    expect(editDistance("", "run")).toBe(3);
    expect(editDistance("doctor", "")).toBe(6);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  it("counts the same distance in both directions", () => {
    expect(editDistance("ab", "bca")).toBe(editDistance("bca", "ab"));
    expect(editDistance("replly", "reply")).toBe(editDistance("reply", "replly"));
  });
});
