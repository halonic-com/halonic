// `withSavedLocalOnly` raises the live version's Local only when the saved workspace.yaml says on,
// and fails closed on a saved file it can't read (HAL-16400).

import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { withSavedLocalOnly } from "@halonicjs/app/saved-local-only";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";

const localOnlyOff = "id: acme\nname: Acme\n";
const localOnlyOn = "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n";

/** Acme's workspace with `workspaceYaml`, loaded. */
function acmeWith(workspaceYaml: string): Promise<LoadedWorkspace> {
  const files = { "workspace.yaml": workspaceYaml, "hubs/support/hub.yaml": "id: support\n" };
  return loadWorkspace(new MemoryDefinitionStore(files));
}

/** Whether `workspace` is local only, as the engine reads it. */
function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}

verifies("studio.engine-service", () => {
  describe("withSavedLocalOnly", () => {
    it("turns Local only on when the saved file says on, without changing the live load", async () => {
      const live = await acmeWith(localOnlyOff);
      const saved = new MemoryDefinitionStore({ "workspace.yaml": localOnlyOn });

      const raised = await withSavedLocalOnly(live, saved);

      expect(isLocalOnly(raised)).toBe(true);
      expect(isLocalOnly(live)).toBe(false);
      expect(raised.files.map((file) => file.path)).toEqual(live.files.map((file) => file.path));
    });

    it("keeps Local only on while it isn't live that it's off", async () => {
      const live = await acmeWith(localOnlyOn);
      const saved = new MemoryDefinitionStore({ "workspace.yaml": localOnlyOff });

      expect(isLocalOnly(await withSavedLocalOnly(live, saved))).toBe(true);
    });

    it("turns it on with the saved settings when the live workspace.yaml didn't parse", async () => {
      const live = await acmeWith("id: acme\nprivacy: [\n");
      const saved = new MemoryDefinitionStore({ "workspace.yaml": localOnlyOn });

      expect(isLocalOnly(await withSavedLocalOnly(live, saved))).toBe(true);
    });

    it("leaves the live version as it is without a saved workspace.yaml", async () => {
      const live = await acmeWith(localOnlyOff);

      expect(await withSavedLocalOnly(live, new MemoryDefinitionStore({}))).toBe(live);
    });

    it("refuses a saved workspace.yaml the account may not read, naming it", async () => {
      const live = await acmeWith(localOnlyOff);
      const saved = new MemoryDefinitionStore({ "workspace.yaml": localOnlyOn });
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
      const saved = new MemoryDefinitionStore({ "workspace.yaml": localOnlyOn });
      saved.read = async () => {
        throw new Error("the folder is gone");
      };

      await expect(withSavedLocalOnly(live, saved)).rejects.toThrow("the folder is gone");
    });
  });
});
