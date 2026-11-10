import { expect, it } from "vitest";
import {
  invalidBranchNames,
  type MakeVcs,
  optionLikeMessages,
  optionLikePaths,
  patternLikePaths,
  unsafeVcsPaths,
} from "./vcs-harness.ts";
import { changesOf, lines, sortChanges, stateOf } from "./vcs-helpers.ts";

/**
 * The safety part of the {@link Vcs} contract (HAL-6 finding 7): nothing a
 * caller passes is read as an option or reaches the repository's own files.
 */
export function vcsSafetyCases(make: MakeVcs): void {
  unsafePathCases(make);
  optionLikeCases(make);
  patternLikeCases(make);
  branchNameCases(make);
}

function unsafePathCases(make: MakeVcs): void {
  it("refuses an unsafe path in every method, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await files.write("b.yaml", "2\n");
    await vcs.stage(["b.yaml"]);
    await files.write("c.yaml", "new\n");
    const before = await stateOf(harness);

    for (const path of unsafeVcsPaths) {
      const label = JSON.stringify(path);
      await expect(vcs.diff(path, false), label).rejects.toThrow(RangeError);
      await expect(vcs.diff(path, true), label).rejects.toThrow(RangeError);
      await expect(vcs.stage([path]), label).rejects.toThrow(RangeError);
      await expect(vcs.unstage([path]), label).rejects.toThrow(RangeError);
      await expect(vcs.discard([path]), label).rejects.toThrow(RangeError);
      // A safe path next to an unsafe one is not acted on either.
      await expect(vcs.stage(["a.yaml", path]), label).rejects.toThrow(RangeError);
      await expect(vcs.unstage(["b.yaml", path]), label).rejects.toThrow(RangeError);
      await expect(vcs.discard(["c.yaml", path]), label).rejects.toThrow(RangeError);
    }
    expect(await stateOf(harness)).toEqual(before);
  });
}

function optionLikeCases(make: MakeVcs): void {
  it.each(optionLikePaths)(
    "treats the tracked file %j as a file, never an option",
    async (path) => {
      const { vcs, files } = await make.repo({ "a.yaml": "1\n", [path]: "1\n" });
      await files.write("a.yaml", "2\n");
      await files.write(path, "2\n");

      expect(lines(await vcs.diff(path, false))).toContain("+2");
      await vcs.stage([path]);
      expect(await changesOf(vcs.status())).toEqual(
        sortChanges([
          { path, status: "modified", staged: true },
          { path: "a.yaml", status: "modified", staged: false },
        ]),
      );
      expect(lines(await vcs.diff(path, true))).toContain("+2");

      await vcs.unstage([path]);
      await vcs.discard([path]);
      expect(await files.read(path)).toBe("1\n");
      expect(await files.read("a.yaml")).toBe("2\n");
      // `--output=written.txt` must not have made git write a file.
      expect((await files.list()).sort()).toEqual(["a.yaml", path].sort());
    },
  );

  it.each(optionLikePaths)("discards the untracked file %j and nothing else", async (path) => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write(path, "new\n");
    await files.write("keep.yaml", "keep\n");
    await vcs.discard([path]);
    expect(await files.read(path)).toBeNull();
    expect(await files.read("keep.yaml")).toBe("keep\n");
  });

  // One repository per message, so each test runs only a few git commands and stays well inside
  // its time limit on a busy CI runner.
  it.each(optionLikeMessages)("commits the message %j as the message", async (message) => {
    const { vcs, files } = await make.repo({ "a.yaml": "0\n" });
    const [first] = await vcs.log(1);
    await files.write("a.yaml", "1\n");
    await vcs.stage(["a.yaml"]);
    const hash = await vcs.commit(message);

    const all = await vcs.log(5);
    expect(all[0]).toMatchObject({ hash, message });
    expect(all[0]?.author).not.toContain("Mallory");
    // `--amend` must not have replaced the first commit: it's still there, unchanged.
    expect(all).toHaveLength(2);
    expect(all[1]).toEqual(first);
  });
}

function patternLikeCases(make: MakeVcs): void {
  it.each(patternLikePaths)(
    "treats the tracked file %j as a file, never a pattern",
    async (path) => {
      const { vcs, files } = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", [path]: "1\n" });
      for (const each of ["a.yaml", "b.yaml", path]) await files.write(each, "2\n");

      await vcs.stage([path]);
      expect(await changesOf(vcs.status())).toEqual(
        sortChanges([
          { path, status: "modified", staged: true },
          { path: "a.yaml", status: "modified", staged: false },
          { path: "b.yaml", status: "modified", staged: false },
        ]),
      );
      await vcs.unstage([path]);
      await vcs.discard([path]);
      expect(await files.read(path)).toBe("1\n");
      expect(await files.read("a.yaml")).toBe("2\n");
      expect(await files.read("b.yaml")).toBe("2\n");
    },
  );

  it.each(patternLikePaths)("discards the untracked file %j and nothing else", async (path) => {
    const { vcs, files } = await make.repo({ "keep.txt": "1\n" });
    for (const each of [path, "a.yaml", "b.yaml", "keep.yaml"]) await files.write(each, "new\n");
    await vcs.discard([path]);
    expect(await files.read(path)).toBeNull();
    expect((await files.list()).sort()).toEqual(["a.yaml", "b.yaml", "keep.txt", "keep.yaml"]);
  });
}

function branchNameCases(make: MakeVcs): void {
  it("reads a checkout name only as a branch, and keeps the file of that name", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    await harness.files.write("a.yaml", "2\n");
    const before = await stateOf(harness);
    await expect(harness.vcs.checkout("a.yaml")).rejects.toThrow();
    expect(await stateOf(harness)).toEqual(before);
  });

  it("refuses a branch name that is an option or that git refuses, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const branchesBefore = (await vcs.branches()).sort();
    const before = await stateOf(harness);

    for (const branch of invalidBranchNames) {
      const label = JSON.stringify(branch);
      await expect(vcs.createBranch(branch), label).rejects.toThrow(RangeError);
      await expect(vcs.checkout(branch), label).rejects.toThrow(RangeError);
    }
    expect((await vcs.branches()).sort()).toEqual(branchesBefore);
    expect(await stateOf(harness)).toEqual(before);
  });
}
