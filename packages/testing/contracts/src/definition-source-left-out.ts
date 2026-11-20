import type { LeaveOut } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { DefinitionFiles, MakeDefinitionSource } from "./definition-store.ts";

/** How an adapter's version behaves, for {@link definitionSourceLeftOutContract}. */
export interface DefinitionSourceLeftOutOptions {
  /**
   * The version names a whole snapshot, such as a commit, so any change
   * makes a new one. The port allows it; the suite then skips the version
   * cases.
   */
  readonly snapshotVersion?: boolean;
}

const repo: LeaveOut = { folders: ["repo"] };
const nodeModules: LeaveOut = { names: ["node_modules"] };

const workspace: DefinitionFiles = {
  "workspace.yaml": "id: acme\n",
  "repository.md": "# Notes\n",
  "repo/src/a.ts": "export const a = 1;\n",
  "files/agents/coder/notes.md": "draft\n",
};

const packages: DefinitionFiles = {
  "workspace.yaml": "id: acme\n",
  "node_modules/x/index.js": "module.exports = 1;\n",
  "tools/Node_Modules/y.js": "module.exports = 2;\n",
  "tools/run.ts": "run();\n",
};

/**
 * The opt-in `leaveOut` of `DefinitionSource.list` and `version`
 * (`ports.definition-store-left-out`). Each adapter opts in once it applies
 * the option; until then it lists everything, which is slower but correct.
 */
export function definitionSourceLeftOutContract(
  name: string,
  make: MakeDefinitionSource,
  options: DefinitionSourceLeftOutOptions = {},
): void {
  verifies("contracts.definition-source-left-out", () => {
    describe(`DefinitionSource left out: ${name}`, () => {
      it("lists everything without options, node_modules too", async () => {
        const source = await make(packages);
        expect(await source.list()).toEqual(Object.keys(packages).sort());
        expect(await source.list(undefined, {})).toEqual(Object.keys(packages).sort());
      });

      it("leaves out a folder, as a file system that ignores case opens it", async () => {
        expect(await (await make(workspace)).list(undefined, { leaveOut: repo })).toEqual([
          "files/agents/coder/notes.md",
          "repository.md",
          "workspace.yaml",
        ]);
        const upper = await make({ "Repo/b.ts": "b\n", "workspace.yaml": "id: acme\n" });
        expect(await upper.list(undefined, { leaveOut: repo })).toEqual(["workspace.yaml"]);
      });

      it("leaves out a deeper folder and lists nothing inside one", async () => {
        const source = await make(workspace);
        const leaveOut = { folders: ["files/agents/coder"] };
        expect(await source.list("files", { leaveOut })).toEqual([]);
        expect(await source.list("repo/src", { leaveOut: repo })).toEqual([]);
      });

      it("leaves out a folder name at any depth and in any case", async () => {
        const source = await make(packages);
        expect(await source.list(undefined, { leaveOut: nodeModules })).toEqual([
          "tools/run.ts",
          "workspace.yaml",
        ]);
        expect(await source.list("tools", { leaveOut: nodeModules })).toEqual(["tools/run.ts"]);
      });

      it("refuses an unsafe folder or name with a RangeError", async () => {
        const source = await make(workspace);
        for (const leaveOut of [{ folders: ["a/../b"] }, { folders: [""] }, { names: ["a/b"] }]) {
          const label = JSON.stringify(leaveOut);
          await expect(source.list(undefined, { leaveOut }), label).rejects.toThrow(RangeError);
          await expect(source.version({ leaveOut }), label).rejects.toThrow(RangeError);
        }
      });

      it("still reads a left-out file", async () => {
        const source = await make(workspace);
        await source.list(undefined, { leaveOut: repo });
        expect(await source.read("repo/src/a.ts")).toBe("export const a = 1;\n");
      });

      if (options.snapshotVersion !== true) {
        it("keeps the version when only a left-out file differs", async () => {
          const edited = { ...workspace, "repo/src/a.ts": "export const a = 2;\n" };
          const before = await make(workspace);
          const after = await make(edited);
          expect(await after.version({ leaveOut: repo })).toBe(
            await before.version({ leaveOut: repo }),
          );
          expect(await after.version()).not.toBe(await before.version());
        });

        it("changes the version when a listed file differs", async () => {
          const before = await make(workspace);
          const after = await make({ ...workspace, "repository.md": "# Changed\n" });
          expect(await after.version({ leaveOut: repo })).not.toBe(
            await before.version({ leaveOut: repo }),
          );
        });
      }
    });
  });
}
