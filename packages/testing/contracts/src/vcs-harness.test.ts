import { describe, expect, it } from "vitest";
import {
  gitInternalPaths,
  invalidBranchNames,
  optionLikePaths,
  plantedHooks,
  unsafeVcsPaths,
} from "./vcs-harness.ts";
import { unsafePatches, unsupportedPatches } from "./vcs-patch-inputs.ts";
import { invalidCommitRefs, unknownCommit } from "./vcs-version-inputs.ts";

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

  it.each([
    ["the name HEAD", "HEAD"],
    ["an option", "-x"],
    ["the previous branch, which git expands", "@{-1}"],
    ["a branch name", "main"],
    ["a short id", "0123456"],
    ["an id in capitals", unknownCommit.toUpperCase()],
  ])("refuses a version that is %s", (_kind, ref) => {
    expect(invalidCommitRefs).toContain(ref);
  });

  it("names .git, .env and a path outside the folder in the unsafe patches", () => {
    const patches = unsafePatches.map(([, patch]) => patch).join("\n");
    for (const path of [".git/config", ".env", "../x.yaml", "rename to .git/config"]) {
      expect(patches).toContain(path);
    }
  });

  it.each([
    ["a mode change", "new mode 100755"],
    ["a symbolic link", "new file mode 120000"],
    ["a gitlink", "new file mode 160000"],
    ["a binary patch", "GIT binary patch"],
    ["a rename header", "rename from a.yaml"],
    ["a copy header", "copy from a.yaml"],
  ])("refuses a patch with %s, on safe paths too", (_kind, line) => {
    const patches = unsupportedPatches.map(([, patch]) => patch);
    expect(patches.some((patch) => patch.split("\n").includes(line))).toBe(true);
  });

  it("names every private entry kind in the unsafe patches, deletes too", () => {
    const patches = unsafePatches.map(([, patch]) => patch).join("\n");
    for (const path of [".env.local", ".envrc", "deleted file mode 100644\n--- a/.env"]) {
      expect(patches).toContain(path);
    }
  });
});
