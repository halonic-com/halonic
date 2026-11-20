import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { absolutePathsOverlap, insideOrSame } from "./path-overlap.ts";

/** A Windows path from its names, such as `windows("C:", "Users")`. */
function windows(...names: string[]): string {
  return names.join("\\");
}

verifies("std.path-overlap", () => {
  it.each([
    ["/person", "/person/.ssh"],
    ["/person/.ssh", "/person"],
    ["/person", "/person"],
    ["/", "/person/.ssh"],
    ["/person/a/../.ssh", "/person/.ssh/id"],
    ["/person//./", "/person/.ssh"],
    [windows("C:", "Users", "Person"), "c:/users/person/.ssh"],
    [windows("C:", ""), windows("C:", "Users")],
    [windows("C:", "Users", "..", ".."), windows("C:", "Users")],
    ["\\\\server\\share", "\\\\server\\share\\x"],
  ])("finds %s and %s overlapping", (a, b) => {
    expect(absolutePathsOverlap(a, b)).toBe(true);
  });

  it.each([
    ["/person/.ssh-notes", "/person/.ssh"],
    ["/person/a", "/person/b"],
    [windows("C:", "Users", "a"), windows("D:", "Users", "a")],
    ["\\\\server\\share", "\\\\server\\shared"],
  ])("finds %s and %s clear of each other", (a, b) => {
    expect(absolutePathsOverlap(a, b)).toBe(false);
  });

  it("compares resolved paths as Windows does", () => {
    expect(insideOrSame(windows("C:", "Users"), windows("c:", "users", "x"))).toBe(true);
    expect(insideOrSame(windows("C:", ""), windows("C:", "Users"))).toBe(true);
    expect(insideOrSame(windows("C:", "Users", "x"), windows("C:", "Users"))).toBe(false);
  });
});
