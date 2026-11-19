import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderRecordLock } from "@halonicjs/adapter-fs-node";
import { type ProfilePlatform, workspaceFolders } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { webCryptoDigest } from "./host-profiles.ts";
import { HostProposalFolders } from "./host-proposals.ts";

const run = {
  runId: "run_1",
  hubId: "hub_1",
  workflowId: "ship",
  version: { reads: "saved-files" },
} as const;

let root: string;
let workspace: string;
let proposals: HostProposalFolders;

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}

const profile = () => ({ platform: profilePlatformOf(process.platform), root: join(root, "data") });

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-host-record-lock-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  await writeFile(join(workspace, "notes.md"), "hello");
  proposals = new HostProposalFolders({
    profile: profile(),
    workspaceRoots: [workspace],
    digest: webCryptoDigest,
    onEndFailed: () => {},
  });
});

afterEach(async () => {
  await proposals.close();
  await rm(root, { recursive: true, force: true });
});

verifies("agent-host.proposal-record-lock", () => {
  describe("the host's proposal records", () => {
    it("opens a run's folder only once another process has released the run's lock", async () => {
      const folders = await workspaceFolders(profile(), workspace, webCryptoDigest);
      // A second lock on the same folder stands in for `halonic proposals` in another process.
      const otherProcess = folderRecordLock(folders.proposalRecordsFolder());
      const steps: string[] = [];
      let release: () => void = () => {};
      const holding = otherProcess("run_1", async () => {
        steps.push("other process holds the lock");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        steps.push("other process releases it");
      });
      await expect.poll(() => steps).toEqual(["other process holds the lock"]);

      const opening = proposals.open(workspace, run).then((folder) => {
        steps.push("host opened the folder");
        return folder;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(steps).toEqual(["other process holds the lock"]);
      release();
      await holding;

      expect(await opening).toBeTypeOf("string");
      expect(steps).toEqual([
        "other process holds the lock",
        "other process releases it",
        "host opened the folder",
      ]);
    });
  });
});
