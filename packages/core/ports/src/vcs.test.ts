import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkCommitId } from "./vcs.ts";

const sha1Id = "3f9c2a1b7d4e0c55a1b2c3d4e5f60718293a4b5c";
const sha256Id = "3f9c2a1b7d4e0c55a1b2c3d4e5f60718293a4b5c3f9c2a1b7d4e0c55a1b2c3d4";

verifies("ports.vcs-commit-ref", () => {
  it.each([sha1Id, sha256Id])("accepts the full commit id %s", (version) => {
    expect(() => checkCommitId(version)).not.toThrow();
  });

  it.each([
    "HEAD",
    "main",
    "@{-1}",
    "--output=x",
    sha1Id.slice(0, 12),
    sha1Id.toUpperCase(),
    `${sha1Id}\n`,
    `${sha1Id}^`,
    "",
  ])("refuses %j", (version) => {
    expect(() => checkCommitId(version)).toThrow(RangeError);
  });
});
