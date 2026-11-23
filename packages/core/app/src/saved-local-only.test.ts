// `withSavedLocalOnly` raises the live version's Local only when the saved workspace.yaml says on,
// and fails closed on a saved file it can't read (HAL-16406).

import type { DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { withSavedLocalOnly } from "./saved-local-only.ts";

const localOnlyOff = "id: acme\nname: Acme\n";
const localOnlyOn = "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n";

/** The files of a version of a workspace, by path, as a `VersionSource` gives them. */
function version(files: Readonly<Record<string, string>>): DefinitionSource {
  return {
    location: "memory:acme",
    list: async (dir) =>
      Object.keys(files)
        .filter((path) => dir === undefined || path.startsWith(`${dir}/`))
        .sort(),
    read: async (path) => files[path] ?? null,
    version: async () => "3f2c1ab",
  };
}

/** Acme's workspace with `workspaceYaml` and one hub, loaded. */
function acmeWith(workspaceYaml: string): Promise<LoadedWorkspace> {
  return loadWorkspace(
    version({ "workspace.yaml": workspaceYaml, "hubs/support/hub.yaml": "id: support\n" }),
  );
}

/** Whether `workspace` is local only, as the engine reads it. */
function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}

verifies("app.saved-local-only", () => {
  describe("withSavedLocalOnly", () => {
    it("turns Local only on when the saved file says on, changing only that flag", async () => {
      const live = await acmeWith(localOnlyOff);

      const raised = await withSavedLocalOnly(live, version({ "workspace.yaml": localOnlyOn }));

      expect(isLocalOnly(raised)).toBe(true);
      expect(isLocalOnly(live)).toBe(false);
      expect(raised.files.map((file) => file.path)).toEqual(live.files.map((file) => file.path));
      expect(filesOf(raised, "workspace")[0]?.value.name).toBe("Acme");
      expect(filesOf(raised, "hub")).toEqual(filesOf(live, "hub"));
    });

    it("keeps Local only on while it isn't live that it's off, without reading the saved file", async () => {
      const live = await acmeWith(localOnlyOn);
      const saved = version({});
      saved.read = async () => {
        throw new Error("the saved files aren't read");
      };

      expect(await withSavedLocalOnly(live, saved)).toBe(live);
    });

    it("turns it on with the saved settings when the live workspace.yaml didn't parse", async () => {
      const live = await acmeWith("id: acme\nprivacy: [\n");

      const raised = await withSavedLocalOnly(live, version({ "workspace.yaml": localOnlyOn }));

      expect(isLocalOnly(raised)).toBe(true);
    });

    it("leaves the live version as it is when the saved file says off or isn't there", async () => {
      const live = await acmeWith(localOnlyOff);

      expect(await withSavedLocalOnly(live, version({ "workspace.yaml": localOnlyOff }))).toBe(
        live,
      );
      expect(await withSavedLocalOnly(live, version({}))).toBe(live);
    });

    it("refuses a saved workspace.yaml with an error, naming its line", async () => {
      const live = await acmeWith(localOnlyOff);

      await expect(
        withSavedLocalOnly(live, version({ "workspace.yaml": "id: acme\nprivacy: [\n" })),
      ).rejects.toMatchObject({
        kind: "invalid_input",
        message: expect.stringMatching(
          /^The saved workspace\.yaml has an error on line \d+, so Halonic can't tell whether Local only is on\. Nothing started\.$/u,
        ),
      });
    });

    it("refuses a saved workspace.yaml the account may not read, naming it", async () => {
      const live = await acmeWith(localOnlyOff);
      const saved = version({});
      saved.read = async () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      };

      await expect(withSavedLocalOnly(live, saved)).rejects.toMatchObject({
        kind: "invalid_input",
        message: "the workspace file workspace.yaml can't be read.",
      });
    });

    it("gives back any other failure to read the saved workspace.yaml", async () => {
      const live = await acmeWith(localOnlyOff);
      const saved = version({});
      saved.read = async () => {
        throw new Error("the folder is gone");
      };

      await expect(withSavedLocalOnly(live, saved)).rejects.toThrow("the folder is gone");
    });
  });
});
