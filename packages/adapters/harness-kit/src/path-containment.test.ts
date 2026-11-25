import thisComputer, { posix } from "node:path";
import { posixPath } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { HostPaths } from "./host-paths.ts";
import { isInsideOrSameOn, isStrictlyInsideOn, overlapsOn } from "./path-containment.ts";

/**
 * The rule sets the checks run under: the desktop's own (`node:path`), Node's
 * POSIX rules, and the POSIX rules the Worker gives its container.
 * The table's paths are POSIX, so on Windows `node:path` reads them as
 * paths on the current drive, which keeps the same answers.
 */
const ruleSets: ReadonlyArray<readonly [string, HostPaths]> = [
  ["node:path", thisComputer],
  ["node:path posix", posix],
  ["std posixPath", posixPath],
];

/** path, folder, inside or same, strictly inside, overlap */
const cases: ReadonlyArray<readonly [string, string, boolean, boolean, boolean]> = [
  ["/workspace/hubs", "/workspace", true, true, true],
  ["/workspace", "/workspace", true, false, true],
  ["/workspace/", "/workspace", true, false, true],
  ["/workspace", "/workspace/hubs", false, false, true],
  ["/a/bc", "/a/b", false, false, false],
  ["/a/b", "/a/bc", false, false, false],
  ["/a/b/../bc", "/a/b", false, false, false],
  ["/a/./b/c", "/a/b", true, true, true],
  ["/", "/", true, false, true],
  ["/anything", "/", true, true, true],
  ["/a/..b", "/a", true, true, true],
  ["/a/../b", "/a", false, false, false],
];

/**
 * Cases only POSIX rules read as written: on Windows a leading `//` starts a
 * UNC path (`\\a\b\c` is share `b` on server `a`), so it is not under `/a/b`.
 */
const posixOnlyCases: typeof cases = [["//a//b//c", "/a/b", true, true, true]];

/** The cases for one rule set: all of them, unless it reads paths the Windows way. */
function casesFor(paths: HostPaths): typeof cases {
  return paths.sep === "/" ? [...cases, ...posixOnlyCases] : cases;
}

verifies("harness-kit.path-containment", () => {
  describe.each(ruleSets)("under %s", (_name, paths) => {
    it.each(casesFor(paths))(
      "checks %j against %j",
      (path, folder, insideOrSame, strictlyInside, overlap) => {
        expect(isInsideOrSameOn(paths, path, folder)).toBe(insideOrSame);
        expect(isStrictlyInsideOn(paths, path, folder)).toBe(strictlyInside);
        expect(overlapsOn(paths, path, folder)).toBe(overlap);
      },
    );
  });
});
