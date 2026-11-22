import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { isTrustRoot } from "./note-check.ts";

verifies("check.guard-two-guardians", () => {
  test("counts a .gitattributes in any folder as a trust root, like the one at the root", () => {
    expect(isTrustRoot(".gitattributes")).toBe(true);
    expect(isTrustRoot("apps/studio/.gitattributes")).toBe(true);
    expect(isTrustRoot("docs/x.gitattributes")).toBe(false);
  });
});
