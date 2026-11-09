import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { editDistance, nearMatch } from "./near-match.ts";

verifies("cli.near-match", () => {
  it("offers the one command or option within two edits", () => {
    expect(nearMatch("tset", ["init", "validate", "test", "run"])).toBe("test");
    expect(nearMatch("--verbos", ["--verbose", "--json"])).toBe("--verbose");
  });

  it("finds a --no- option by its stem", () => {
    expect(nearMatch("--colour", ["--json", "--no-color", "--verbose"])).toBe("--no-color");
  });

  it("offers nothing when no candidate is that close, or when two are", () => {
    expect(nearMatch("deploy", ["init", "test", "run"])).toBeUndefined();
    expect(nearMatch("rux", ["run", "runs"])).toBeUndefined();
  });
});

describe("editDistance", () => {
  it("counts insertions, deletions, substitutions and swaps of neighbours", () => {
    expect(editDistance("test", "test")).toBe(0);
    expect(editDistance("tset", "test")).toBe(1);
    expect(editDistance("tst", "test")).toBe(1);
    expect(editDistance("tesst", "test")).toBe(1);
    expect(editDistance("text", "test")).toBe(1);
    expect(editDistance("", "run")).toBe(3);
    expect(editDistance("doctor", "")).toBe(6);
  });
});
