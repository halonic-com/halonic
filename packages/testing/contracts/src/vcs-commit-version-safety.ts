import { expect, it } from "vitest";
import { filesOf } from "./vcs-commit-version.ts";
import { type MakeVcs, optionLikePaths, patternLikePaths, unsafeVcsPaths } from "./vcs-harness.ts";
import { changesOf, stagedDiffs, stateOf } from "./vcs-helpers.ts";
import { privateWorkspaceFiles } from "./vcs-version-inputs.ts";

/**
 * The safety part of the {@link Vcs} contract for Create version: every
 * path in `include` and `exclude` goes through the port's path rules and is
 * read as a file name only, and no private entry ever gets into a version.
 */
export function vcsCommitVersionSafetyCases(make: MakeVcs): void {
  pathCases(make);
  privateEntryCases(make);
}

function pathCases(make: MakeVcs): void {
  it("refuses an unsafe or private path in include or exclude, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", ...privateWorkspaceFiles });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await files.write("b.yaml", "new\n");
    const before = await stateOf(harness);
    const staged = await stagedDiffs(harness, ["a.yaml"]);
    const onDisk = await filesOf(harness, Object.keys(privateWorkspaceFiles));

    for (const path of unsafeVcsPaths) {
      const label = JSON.stringify(path);
      const message = "Create version";
      await expect(
        vcs.commitVersion({ message, include: [path], exclude: [] }),
        label,
      ).rejects.toThrow(RangeError);
      await expect(
        vcs.commitVersion({ message, include: ["a.yaml", path], exclude: [] }),
        label,
      ).rejects.toThrow(RangeError);
      await expect(vcs.commitVersion({ message, exclude: [path] }), label).rejects.toThrow(
        RangeError,
      );
      await expect(
        vcs.commitVersion({ message, exclude: ["b.yaml", path] }),
        label,
      ).rejects.toThrow(RangeError);
    }
    expect(await stateOf(harness)).toEqual(before);
    expect(await stagedDiffs(harness, ["a.yaml"])).toEqual(staged);
    expect(await filesOf(harness, Object.keys(privateWorkspaceFiles))).toEqual(onDisk);
  });

  it.each([...optionLikePaths, ...patternLikePaths])(
    "reads %j in include and exclude as that file only, never an option or a pattern",
    async (path) => {
      const { vcs, files } = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", [path]: "1\n" });
      await files.write("a.yaml", "2\n");
      await files.write(path, "2\n");

      const excluded = await vcs.commitVersion({ message: "Leave it out", exclude: [path] });
      expect(await vcs.readAt(excluded, "a.yaml")).toBe("2\n");
      expect(await vcs.readAt(excluded, path)).toBe("1\n");

      await files.write("b.yaml", "2\n");
      const included = await vcs.commitVersion({
        message: "Only it",
        include: [path],
        exclude: [],
      });
      expect(await vcs.readAt(included, path)).toBe("2\n");
      expect(await vcs.readAt(included, "b.yaml")).toBe("1\n");
      expect(await changesOf(vcs.status())).toEqual([
        { path: "b.yaml", status: "modified", staged: false },
      ]);
    },
  );
}

function privateEntryCases(make: MakeVcs): void {
  it("never commits a private entry, even one the repository doesn't ignore", async () => {
    const nested = { "agents/.env": "KEY=4\n", "agents/.env.local": "KEY=5\n" };
    const privateFiles = { ...privateWorkspaceFiles, ...nested };
    const harness = await make.repo({ "a.yaml": "1\n", "agents/b.yaml": "1\n", ...privateFiles });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await files.write("agents/b.yaml", "2\n");
    const onDisk = await filesOf(harness, Object.keys(privateFiles));

    const everything = await vcs.commitVersion({ message: "Everything", exclude: [] });
    expect(await harness.privateAt(everything)).toEqual([]);
    expect(await vcs.listAt(everything)).toEqual(["a.yaml", "agents/b.yaml"]);

    await files.write("agents/b.yaml", "3\n");
    const underAgents = await vcs.commitVersion({
      message: "Agents",
      include: ["agents"],
      exclude: [],
    });
    expect(await harness.privateAt(underAgents)).toEqual([]);
    expect(await vcs.readAt(underAgents, "agents/b.yaml")).toBe("3\n");

    // The private entries stay on disk as they were, untouched.
    expect(await filesOf(harness, Object.keys(privateFiles))).toEqual({
      ...onDisk,
      "agents/b.yaml": "3\n",
    });
    expect((await vcs.status()).changes).toEqual([]);
  });
}
