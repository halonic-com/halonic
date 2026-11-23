import { mkdir, mkdtemp, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { engineStateFolders, engineStateFoldersAt } from "./engine-state-folders.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

/** A Linux computer whose home is `/srv/acme`, with no profile variables set. */
const acmeLinux: ProfileEnvironment = { platform: "linux", homeFolder: "/srv/acme", variables: {} };

verifies("workspace-engine-node.engine-state-folders", () => {
  describe("engineStateFoldersAt", () => {
    // The "Linux path" case of `golden/workspace-folders.json` in `@halonicjs/profile`,
    // which the Studio's Rust side checks too: should the two drift apart, the
    // CLI and the Studio would use different engine locks for one workspace.
    it("gives the folders the profile's golden file names for a fixed path", async () => {
      const place = await engineStateFoldersAt("/srv/acme/workspace", acmeLinux);

      expect(place.location).toBe("/srv/acme/workspace");
      expect(place.profile.root).toBe("/srv/acme/.local/share/halonic");
      expect(place.folders.folder).toBe(
        "/srv/acme/.local/share/halonic/workspaces/3a799e428169278421370a605619c6ed",
      );
      expect(place.folders.runsFolder()).toBe(
        "/srv/acme/.local/share/halonic/workspaces/3a799e428169278421370a605619c6ed/runs",
      );
      expect(place.environment).toBe(acmeLinux);
    });
  });

  describe("engineStateFolders", () => {
    let folder: string;

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), "acme-engine-state-"));
    });

    afterEach(async () => {
      await removeTestFolder(folder);
    });

    it("gives a link to a workspace the folders of the workspace itself", async () => {
      const workspace = join(folder, "workspace");
      await mkdir(workspace);
      const link = join(folder, "link");
      await symlink(workspace, link, "dir");
      const environment: ProfileEnvironment = {
        ...acmeLinux,
        variables: { HALONIC_HOME: join(folder, "profile") },
      };

      const throughLink = await engineStateFolders(link, environment);
      const direct = await engineStateFolders(workspace, environment);

      expect(throughLink.folders.folder).toBe(direct.folders.folder);
      expect(throughLink.location).toBe(direct.location);
    });

    it("creates nothing", async () => {
      const workspace = join(folder, "workspace");
      await mkdir(workspace);
      const environment: ProfileEnvironment = {
        ...acmeLinux,
        variables: { HALONIC_HOME: join(folder, "profile") },
      };

      await engineStateFolders(workspace, environment);

      expect(await readdir(folder)).toEqual(["workspace"]);
    });

    it("refuses a workspace folder that doesn't exist", async () => {
      await expect(engineStateFolders(join(folder, "missing"), acmeLinux)).rejects.toThrow();
    });
  });
});
