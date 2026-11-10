import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import golden from "./golden/workspace-folders.json" with { type: "json" };
import type { ProfileFolder } from "./profile-folder.ts";
import { workspaceFolders } from "./workspace-folders.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/**
 * One workspace in `golden/workspace-folders.json`, which the desktop
 * shell's Rust port (`apps/studio/src-tauri/crates/profile`) checks too.
 * Drives are written `<drive>`, so the repo's leak guard doesn't read them
 * as a real machine's paths. Non-ASCII characters are written as escapes,
 * so a decomposed and a composed `é` can be told apart.
 */
type GoldenWorkspace = {
  readonly name: string;
  readonly platform: ProfileFolder["platform"];
  readonly profile: string;
  readonly workspace: string;
} & (
  | { readonly folder: string; readonly runs: string; readonly stagingRuns: string }
  /** A workspace path that is refused. */
  | { readonly folder: null; readonly runs: null; readonly stagingRuns: null }
);

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.workspace-folders", () => {
  describe("the golden workspace folders", () => {
    for (const goldenCase of golden.workspaces as readonly GoldenWorkspace[]) {
      it(goldenCase.name, async () => {
        const profile: ProfileFolder = {
          platform: goldenCase.platform,
          root: drive(goldenCase.profile),
        };
        const found = workspaceFolders(profile, drive(goldenCase.workspace), digest);
        if (goldenCase.folder === null) {
          await expect(found).rejects.toThrow(RangeError);
          return;
        }
        const folders = await found;
        expect(folders.folder).toBe(drive(goldenCase.folder));
        expect(folders.runsFolder()).toBe(drive(goldenCase.runs));
        expect(folders.runsFolder("staging")).toBe(drive(goldenCase.stagingRuns));
      });
    }
  });

  describe("the golden deployment ids", async () => {
    const profile: ProfileFolder = { platform: "linux", root: "/srv/acme/.local/share/halonic" };
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);

    it.each(golden.deploymentIds.accepted)("accepts %j", (id) => {
      expect(folders.runsFolder(id)).toBe(`${folders.folder}/deployments/${id}/runs`);
    });

    it.each(golden.deploymentIds.refused)("refuses %j", (id) => {
      expect(() => folders.runsFolder(id)).toThrow(RangeError);
    });
  });
});
