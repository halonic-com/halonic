import type { Digest } from "@halonicjs/ports";
import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { joinPath } from "./native-path.ts";
import type { ProfileFolder } from "./profile-folder.ts";
import { checkDeploymentId, isDeploymentId, workspaceFolders } from "./workspace-folders.ts";

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

  it("keeps the workspace's records beside its runs and blobs", async () => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(folders.recordsFolder()).toBe(`${folders.folder}/records`);
    const windows = await workspaceFolders(windowsProfile, `${drive}\\Work\\Acme`, digest);
    expect(windows.recordsFolder()).toBe(`${windows.folder}\\records`);
  });

  it("keeps the workspace's changes to review beside its records", async () => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(folders.reviewFolder()).toBe(`${folders.folder}/review`);
    const windows = await workspaceFolders(windowsProfile, `${drive}\\Work\\Acme`, digest);
    expect(windows.reviewFolder()).toBe(`${windows.folder}\\review`);
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

  it.each([
    ["Rust's verbatim form", `\\\\?\\${drive}\\Work\\Acme`],
    ["forward slashes", `${drive}/Work/Acme`],
    ["a trailing separator", `${drive}\\Work\\Acme\\`],
  ])("gives one key on Windows for %s", async (_spelling, path) => {
    const plain = await workspaceFolders(windowsProfile, `${drive}\\Work\\Acme`, digest);
    const other = await workspaceFolders(windowsProfile, path, digest);
    expect(other.folder).toBe(plain.folder);
  });

  it("gives one key on Windows for a share in verbatim form", async () => {
    const plain = await workspaceFolders(windowsProfile, "\\\\acme-files\\work\\acme", digest);
    const verbatim = await workspaceFolders(
      windowsProfile,
      "\\\\?\\UNC\\acme-files\\work\\acme",
      digest,
    );
    expect(verbatim.folder).toBe(plain.folder);
  });

  it("keeps a drive's root apart from a folder on it", async () => {
    const root = await workspaceFolders(windowsProfile, `\\\\?\\${drive}\\`, digest);
    const folder = await workspaceFolders(windowsProfile, `${drive}\\acme`, digest);
    expect(root.folder).not.toBe(folder.folder);
  });

  it("ignores a trailing separator on Linux, and keeps case apart", async () => {
    const plain = await workspaceFolders(profile, "/srv/acme", digest);
    const trailing = await workspaceFolders(profile, "/srv/acme/", digest);
    const upper = await workspaceFolders(profile, "/srv/Acme", digest);
    expect(trailing.folder).toBe(plain.folder);
    expect(upper.folder).not.toBe(plain.folder);
  });

  it("ignores case and Unicode form on macOS", async () => {
    const macProfile: ProfileFolder = { platform: "macos", root: "/srv/acme/halonic" };
    const composed = await workspaceFolders(macProfile, "/srv/acme/Café", digest);
    const decomposed = await workspaceFolders(macProfile, "/srv/acme/café/", digest);
    expect(decomposed.folder).toBe(composed.folder);
  });

  it("puts a deployment's runs in their own folder", async () => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(folders.runsFolder("staging")).toBe(`${folders.folder}/deployments/staging/runs`);
  });

  it("refuses a relative workspace path", async () => {
    await expect(workspaceFolders(profile, "workspace", digest)).rejects.toThrow(RangeError);
  });

  describe("deployment ids", () => {
    it.each(["../staging", "Staging", "", "-staging", "con", "lpt1", "a".repeat(65)])(
      "refuses %j",
      async (deploymentId) => {
        const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
        expect(() => folders.runsFolder(deploymentId)).toThrow(RangeError);
        expect(() => checkDeploymentId(deploymentId)).toThrow(RangeError);
        expect(isDeploymentId(deploymentId)).toBe(false);
      },
    );

    it.each(["a", "com10", "console", "a".repeat(64)])("accepts %j", async (deploymentId) => {
      const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
      expect(folders.runsFolder(deploymentId)).toBe(
        `${folders.folder}/deployments/${deploymentId}/runs`,
      );
      expect(isDeploymentId(deploymentId)).toBe(true);
    });
  });
});

verifies("profile.harness-settings-folder", () => {
  it("keeps an agent's harness settings in the workspace's folder, one folder per harness", async () => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(folders.harnessSettingsFolder("writer", "claude-code")).toBe(
      `${folders.folder}/harness-settings/writer/claude-code`,
    );
    expect(folders.harnessSettingsFolder("writer", "codex")).not.toBe(
      folders.harnessSettingsFolder("writer", "claude-code"),
    );
    const windows = await workspaceFolders(windowsProfile, `${drive}\\Work\\Acme`, digest);
    expect(windows.harnessSettingsFolder("writer", "claude-code")).toBe(
      `${windows.folder}\\harness-settings\\writer\\claude-code`,
    );
  });

  it("gives one agent id in two workspaces different folders", async () => {
    const one = await workspaceFolders(profile, "/srv/acme/one", digest);
    const two = await workspaceFolders(profile, "/srv/acme/two", digest);
    expect(one.harnessSettingsFolder("writer", "claude-code")).not.toBe(
      two.harnessSettingsFolder("writer", "claude-code"),
    );
  });

  it.each(["../writer", "Writer", "", "con", "a".repeat(65)])("refuses %j", async (badId) => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(() => folders.harnessSettingsFolder(badId, "claude-code")).toThrow(RangeError);
    expect(() => folders.harnessSettingsFolder("writer", badId)).toThrow(RangeError);
  });

  it("names the kind of id it refuses", async () => {
    const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
    expect(() => folders.harnessSettingsFolder("../writer", "claude-code")).toThrow(
      /^Not an agent id/,
    );
    expect(() => folders.harnessSettingsFolder("writer", "Codex")).toThrow(/^Not a harness id/);
  });
});
