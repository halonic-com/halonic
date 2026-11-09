import { type ErrorKind, errorKinds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ExitCode, exitCode } from "./exit-code.ts";
import { exitCodeFor } from "./exit-code-for.ts";

/** The exit code table of HAL-1984, written out so a renumbering shows up here. */
const expected: Record<ErrorKind, ExitCode> = {
  internal: 1,
  invalid_input: 2,
  not_found: 4,
  conflict: 5,
  unauthenticated: 6,
  denied: 7,
  limit_reached: 8,
  unavailable: 9,
};

verifies("cli.exit-codes", () => {
  for (const kind of errorKinds) {
    it(`ends a ${kind} error with exit code ${expected[kind]}`, () => {
      expect(exitCodeFor(kind)).toBe(expected[kind]);
    });
  }

  it("never uses 3, which means the workspace isn't trusted", () => {
    expect(errorKinds.map(exitCodeFor)).not.toContain(exitCode.notTrusted);
  });
});
