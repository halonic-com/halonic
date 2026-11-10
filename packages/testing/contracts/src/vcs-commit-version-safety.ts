import { unversionedFolders } from "@halonicjs/ports";
import { expect, it } from "vitest";
import { filesOf } from "./vcs-commit-version.ts";
import { type MakeVcs, optionLikePaths, patternLikePaths, unsafeVcsPaths } from "./vcs-harness.ts";
import { changesOf, stagedDiffs, stateOf } from "./vcs-helpers.ts";
import { privateWorkspaceFiles } from "./vcs-version-inputs.ts";

/**
 * The safety part of the {@link Vcs} contract for Create version: every
 * path in `include` and `exclude` goes through the port's path rules and is
 * read as a file name only, and no private entry or review record ever
 * gets into a version.
 */
export function vcsCommitVersionSafetyCases(make: MakeVcs): void {
  pathCases(make);
  privateEntryCases(make);
  reviewRecordCases(make);
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

function reviewRecordCases(make: MakeVcs): void {
  it("never commits a change under .halonic/review/, whatever .gitignore says", async () => {
    // As in a workspace made before init ignored the folder: HEAD tracks two records.
    const harness = await make.repo({
      "a.yaml": "1\n",
      ".halonic/review/b.json": "{}\n",
      ".halonic/review/old.json": "{}\n",
    });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await files.write(".halonic/review/b.json", '{"changed":true}\n');
    await files.remove(".halonic/review/old.json");
    await files.write(".halonic/review/c.json", "{}\n");
    await files.write(".halonic/review/run/d.json", "{}\n");
    // Neighbours of the folder are committed as usual.
    await files.write(".halonic/notes.md", "kept\n");
    await files.write(".halonic/reviewer.md", "kept\n");
    const onDisk = await filesOf(harness);

    const everything = await vcs.commitVersion({ message: "Everything", exclude: [] });
    expect(await vcs.listAt(everything)).toEqual([
      ".halonic/notes.md",
      ".halonic/review/b.json",
      ".halonic/review/old.json",
      ".halonic/reviewer.md",
      "a.yaml",
    ]);
    expect(await vcs.readAt(everything, ".halonic/review/b.json")).toBe("{}\n");
    expect(await vcs.readAt(everything, ".halonic/review/old.json")).toBe("{}\n");
    expect(await vcs.readAt(everything, "a.yaml")).toBe("2\n");

    // Naming the folder, or its parent, in include doesn't let a record in.
    await files.write(".halonic/notes.md", "kept again\n");
    const underHalonic = await vcs.commitVersion({
      message: "Halonic folder",
      include: [".halonic"],
      exclude: [],
    });
    expect(await vcs.listAt(underHalonic)).toEqual(await vcs.listAt(everything));
    expect(await vcs.readAt(underHalonic, ".halonic/review/b.json")).toBe("{}\n");
    expect(await vcs.readAt(underHalonic, ".halonic/notes.md")).toBe("kept again\n");
    await expect(
      vcs.commitVersion({ message: "Records", include: [".halonic/review"], exclude: [] }),
    ).rejects.toThrow();

    // The records stay on disk as they were, untouched.
    expect(await filesOf(harness)).toEqual({ ...onDisk, ".halonic/notes.md": "kept again\n" });
  });

  it("names .halonic/review in the port's unversionedFolders", () => {
    expect(unversionedFolders).toContain(".halonic/review");
  });
}
