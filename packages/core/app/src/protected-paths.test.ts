import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { askProtectedPaths, isProtectedPath, writeFencedPaths } from "./protected-paths.ts";

verifies("app.protected-paths", () => {
  it("protects every write-fenced entry and everything inside it", () => {
    for (const entry of writeFencedPaths) {
      expect(isProtectedPath(entry, false)).toBe(true);
      expect(isProtectedPath([...entry, "inner", "file"], false)).toBe(true);
    }
  });

  it("protects all of .claude, which the write fence only partly covers", () => {
    expect(writeFencedPaths).not.toContainEqual([".claude"]);
    expect(askProtectedPaths).toContainEqual([".claude"]);
    expect(isProtectedPath([".claude", "notes.md"], false)).toBe(true);
  });

  it("protects a .git segment at any depth", () => {
    expect(isProtectedPath(["vendor", "lib", ".git", "config"], false)).toBe(true);
    expect(isProtectedPath([".git"], false)).toBe(true);
  });

  it("matches a fenced entry only at the working folder's root", () => {
    expect(isProtectedPath(["sub", ".npmrc"], false)).toBe(false);
  });

  it("ignores letter case only where the file system does", () => {
    expect(isProtectedPath([".GIT", "config"], true)).toBe(true);
    expect(isProtectedPath([".Claude", "x"], true)).toBe(true);
    expect(isProtectedPath([".GIT", "config"], false)).toBe(false);
  });

  it("leaves ordinary files alone", () => {
    expect(isProtectedPath(["src", "index.ts"], false)).toBe(false);
    expect(isProtectedPath([], false)).toBe(false);
    expect(isProtectedPath([".gitignore"], false)).toBe(false);
  });
});
