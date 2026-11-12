import { mkdir, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type StartFolderProfile, startFolder } from "./start-folder.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** A link to a folder: a junction on Windows, which needs no extra rights there. */
async function linkTo(target: string, link: string): Promise<void> {
  await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
}

// A connector's session as HAL-2310 sets it up: its own working folder, the
// workspace read-only, and an agent's working folder in the workspace denied.
let root: string;
let profile: StartFolderProfile;
let workspace: string;
let agentFolder: string;

beforeAll(async () => {
  root = await realpath(await tempFolder());
  workspace = join(root, "workspace");
  agentFolder = join(workspace, "files", "agents", "writer");
  await mkdir(join(root, "working", "sub"), { recursive: true });
  await mkdir(join(workspace, "tools"), { recursive: true });
  await mkdir(join(agentFolder, "reports"), { recursive: true });
  await mkdir(join(root, "elsewhere"), { recursive: true });
  profile = {
    workingFolder: join(root, "working"),
    readOnlyPaths: [workspace],
    deniedPaths: [agentFolder],
  };
});

verifies("system-node.start-folder", () => {
  describe("startFolder", () => {
    it("starts in the working folder when no folder is asked for", async () => {
      await expect(startFolder(profile, undefined)).resolves.toBe(profile.workingFolder);
    });

    it("reads a relative folder against the working folder", async () => {
      await expect(startFolder(profile, "sub")).resolves.toBe(join(profile.workingFolder, "sub"));
    });

    it("allows a folder inside a read-only path, such as the workspace a script is in", async () => {
      await expect(startFolder(profile, join(workspace, "tools"))).resolves.toBe(
        join(workspace, "tools"),
      );
    });

    it("refuses a folder outside the working folder and every read-only path", async () => {
      await expect(startFolder(profile, join(root, "elsewhere"))).rejects.toThrow(
        /must start inside the working folder or a read-only path, not in .*elsewhere/,
      );
    });

    it("refuses a folder that climbs out of the working folder", async () => {
      await expect(startFolder(profile, "..")).rejects.toThrow(/must start inside/);
    });

    it("reads a folder that doesn't exist yet through the links above it", async () => {
      await expect(startFolder(profile, join(workspace, "not", "yet"))).resolves.toBe(
        join(workspace, "not", "yet"),
      );
      const link = join(workspace, "to-agent-later");
      await linkTo(agentFolder, link);
      await expect(startFolder(profile, join(link, "not-yet"))).rejects.toThrow(/denied to it/);
    });

    it("refuses a denied folder inside a read-only path", async () => {
      await expect(startFolder(profile, join(agentFolder, "reports"))).rejects.toThrow(
        /denied to it/,
      );
    });

    it("refuses a link in the workspace that leads into a denied folder", async () => {
      const link = join(workspace, "tools", "to-agent");
      await linkTo(agentFolder, link);
      await expect(startFolder(profile, link)).rejects.toThrow(/denied to it/);
    });

    it("refuses a link in the workspace that leads out of every allowed path", async () => {
      const link = join(workspace, "tools", "to-elsewhere");
      await linkTo(join(root, "elsewhere"), link);
      await expect(startFolder(profile, link)).rejects.toThrow(/must start inside/);
    });

    it("starts in the real folder a link leads to", async () => {
      const link = join(workspace, "tools-link");
      await linkTo(join(workspace, "tools"), link);
      await expect(startFolder(profile, link)).resolves.toBe(join(workspace, "tools"));
    });

    it("compares the profile's folders where they really are, as macOS's /var is a link", async () => {
      const linkedRoot = join(root, "linked-root");
      await linkTo(root, linkedRoot);
      const throughLink = { ...profile, workingFolder: join(linkedRoot, "working") };
      await expect(startFolder(throughLink, undefined)).resolves.toBe(profile.workingFolder);
    });

    it("allows a denied folder again where it is reopened", async () => {
      const reopened = { ...profile, reopenedPaths: [join(agentFolder, "reports")] };
      await expect(startFolder(reopened, join(agentFolder, "reports"))).resolves.toBe(
        join(agentFolder, "reports"),
      );
    });

    it("refuses one of the session's own hidden folders", async () => {
      await expect(
        startFolder(profile, join(profile.workingFolder, "sub"), [profile.workingFolder]),
      ).rejects.toThrow(/denied to it/);
    });
  });
});
