import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { askProtectedPaths, isProtectedPath, writeFencedPaths } from "./protected-paths.ts";

verifies("app.protected-paths", () => {
  it("protects every write-fenced entry and everything inside it", () => {
    for (const entry of writeFencedPaths) {
      expect(isProtectedPath(entry)).toBe(true);
      expect(isProtectedPath([...entry, "inner", "file"])).toBe(true);
    }
  });

  it("protects all of .claude, which the write fence only partly covers", () => {
    expect(writeFencedPaths).not.toContainEqual([".claude"]);
    expect(askProtectedPaths).toContainEqual([".claude"]);
    expect(isProtectedPath([".claude", "notes.md"])).toBe(true);
  });

  it("protects a .git segment at any depth", () => {
    expect(isProtectedPath(["vendor", "lib", ".git", "config"])).toBe(true);
    expect(isProtectedPath([".git"])).toBe(true);
  });

  it("matches a fenced entry only at the working folder's root", () => {
    expect(isProtectedPath(["sub", ".npmrc"])).toBe(false);
  });

  it("always ignores letter case, since a missing part keeps the case it was typed in", () => {
    expect(isProtectedPath([".GIT", "config"])).toBe(true);
    expect(isProtectedPath([".Claude", "settings.json"])).toBe(true);
  });

  it("leaves ordinary files alone", () => {
    expect(isProtectedPath(["src", "index.ts"])).toBe(false);
    expect(isProtectedPath([])).toBe(false);
    expect(isProtectedPath([".gitignore"])).toBe(false);
  });
});
