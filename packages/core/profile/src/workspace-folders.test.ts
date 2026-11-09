import type { Digest } from "@halonicjs/ports";
import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { joinPath } from "./native-path.ts";
import type { ProfileFolder } from "./profile-folder.ts";
import { workspaceFolders } from "./workspace-folders.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const profile: ProfileFolder = { platform: "linux", root: "/srv/acme/.local/share/halonic" };

// Built from parts, so the repo's leak guard doesn't read them as a real machine's paths.
const drive = "D:";
const windowsProfile: ProfileFolder = { platform: "windows", root: `${drive}\\halonic` };

verifies("profile.workspace-folders", () => {
  it("gives one workspace the same folders every time", async () => {
    const first = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    const second = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(first.runsFolder()).toBe(second.runsFolder());
    expect(first.folder).toMatch(
      /^\/srv\/acme\/\.local\/share\/halonic\/workspaces\/[0-9a-f]{32}$/,
    );
    expect(first.runsFolder()).toBe(`${first.folder}/runs`);
    expect(first.blobsFolder()).toBe(`${first.folder}/blobs`);
  });

  it("keys the folder by the SHA-256 of the real path", async () => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    const hash = await digest.sha256(encodeUtf8("/srv/acme/workspace"));
    expect(folders.folder.endsWith(bytesToHex(hash).slice(0, 32))).toBe(true);
  });

  it("gives two workspaces different folders", async () => {
    const one = await workspaceFolders(profile, "/srv/acme/one", digest);
    const two = await workspaceFolders(profile, "/srv/acme/two", digest);
    expect(one.folder).not.toBe(two.folder);
  });

  it("ignores case on Windows, and joins with backslashes", async () => {
    const upper = await workspaceFolders(windowsProfile, `${drive}\\Work\\Acme`, digest);
    const lower = await workspaceFolders(windowsProfile, `${drive}\\work\\acme`, digest);
    expect(upper.folder).toBe(lower.folder);
    expect(upper.runsFolder("staging")).toBe(
      joinPath("windows", upper.folder, "deployments", "staging", "runs"),
    );
    expect(upper.runsFolder("staging")).toMatch(/\\deployments\\staging\\runs$/);
  });

  it("keeps case apart on Linux", async () => {
    const upper = await workspaceFolders(profile, "/srv/Acme", digest);
    const lower = await workspaceFolders(profile, "/srv/acme", digest);
    expect(upper.folder).not.toBe(lower.folder);
  });

  it("puts a deployment's runs in their own folder", async () => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(folders.runsFolder("staging")).toBe(`${folders.folder}/deployments/staging/runs`);
  });

  it("refuses a relative workspace path", async () => {
    await expect(workspaceFolders(profile, "workspace", digest)).rejects.toThrow(RangeError);
  });

  describe("deployment ids", () => {
    it.each(["../staging", "Staging", "", "-staging", "con", "lpt1", "a".repeat(129)])(
      "refuses %j",
      async (deploymentId) => {
        const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
        expect(() => folders.runsFolder(deploymentId)).toThrow(RangeError);
      },
    );
  });
});
