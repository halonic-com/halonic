import { describe, expect, it } from "vitest";
import {
  gitInternalPaths,
  invalidBranchNames,
  optionLikePaths,
  plantedHooks,
  unsafeVcsPaths,
} from "./vcs-harness.ts";

describe("Vcs safety lists (contracts.vcs-safety)", () => {
  // The suite is only as strong as these lists: each kind of input from the port doc is in them.
  it.each([
    ["a .git segment in another case", (path: string) => path.split("/").includes(".GIT")],
    ["a .git segment below the root", (path: string) => /^[^/]+\/\.git\//.test(path)],
    ["a .git segment with a trailing dot", (path: string) => path.startsWith(".git./")],
    ["a .git segment with a trailing space", (path: string) => path.startsWith(".git /")],
    ["the short name git~1", (path: string) => path.toLowerCase().startsWith("git~1/")],
  ])("has a git-internal path with %s", (_kind, matches) => {
    expect(gitInternalPaths.some(matches)).toBe(true);
  });

  it.each([
    ["an option prefix git expands", "--upload-pac=touch pwned"],
    ["a short option with its value attached", "-ccore.sshCommand=touch pwned"],
    ["the name HEAD", "HEAD"],
    ["a .lock part", "a.lock"],
    ["a control character", "a\u007fb"],
    ["the previous branch, which git expands", "@{-1}"],
  ])("has a branch name with %s", (_kind, name) => {
    expect(invalidBranchNames).toContain(name);
  });

  it("refuses every private path a definition store refuses, not only .git", () => {
    expect(unsafeVcsPaths).toEqual(
      expect.arrayContaining([".env", ".env.local", ".studio/trust.json", ".g\u200Cit/config"]),
    );
  });

  it("plants the hooks that commit, checkout, push and pull would run", () => {
    expect(plantedHooks).toEqual(
      expect.arrayContaining(["pre-commit", "post-checkout", "pre-push", "post-merge"]),
    );
  });

  it("has option-like paths for git add, git diff and git clean", () => {
    expect(optionLikePaths).toEqual(
      expect.arrayContaining(["--all", "--output=written.txt", "-f"]),
    );
  });
});
