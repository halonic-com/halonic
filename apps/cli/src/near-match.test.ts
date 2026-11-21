import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { nearMatch } from "./near-match.ts";

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
