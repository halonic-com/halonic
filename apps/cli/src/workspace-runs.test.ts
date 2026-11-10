import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { bytesToHex } from "@halonicjs/std";
import { completed, started } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  nodeProfileEnvironment,
  openWorkspaceRuns,
  profilePlatformOf,
  webCryptoDigest,
} from "./workspace-runs.ts";

let folder: string;
let profile: string;
let workspace: string;
let environment: ProfileEnvironment;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-runs-"));
  profile = join(folder, "profile");
  workspace = join(folder, "acme");
  await mkdir(profile);
  await mkdir(workspace);
  environment = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: profile } };
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Stores one completed run, `01JD8Q`, for the workspace in `root`. */
async function storeOneRun(root: string): Promise<void> {
  const runs = await openWorkspaceRuns(root, environment);
  const result = await runs.append("01JD8Q", 0, [started("01JD8Q"), completed("01JD8Q", 2)]);
  expect(result.ok).toBe(true);
}

async function listedIds(root: string): Promise<string[]> {
  const runs = await openWorkspaceRuns(root, environment);
  return (await runs.list()).map((run) => run.id);
}

verifies("cli.workspace-runs", () => {
  it("keeps a workspace's runs in the profile folder, not in the workspace", async () => {
    await storeOneRun(workspace);

    expect(await listedIds(workspace)).toEqual(["01JD8Q"]);
    expect(await readdir(workspace)).toEqual([]);
    expect(await readdir(profile)).toEqual(["workspaces"]);
  });

  it("opens the same runs through a link to the workspace", async () => {
    const link = join(folder, "acme-link");
    // A junction on Windows, which needs no special rights; other systems ignore the type.
    await symlink(workspace, link, "junction");
    await storeOneRun(workspace);

    expect(await listedIds(link)).toEqual(["01JD8Q"]);
  });

  it("lists no runs for a workspace with none, and creates nothing", async () => {
    expect(await listedIds(workspace)).toEqual([]);
    expect(await readdir(profile)).toEqual([]);
  });

  it("fails for a folder that doesn't exist, and creates nothing", async () => {
    await expect(openWorkspaceRuns(join(folder, "missing"), environment)).rejects.toThrow();
    expect(await readdir(profile)).toEqual([]);
  });
});

describe("profilePlatformOf", () => {
  it("names Windows, macOS, and keeps every other system like Linux", () => {
    expect(profilePlatformOf("win32")).toBe("windows");
    expect(profilePlatformOf("darwin")).toBe("macos");
    expect(profilePlatformOf("linux")).toBe("linux");
    expect(profilePlatformOf("freebsd")).toBe("linux");
  });
});

describe("webCryptoDigest", () => {
  it("gives the SHA-256 of the bytes", async () => {
    const hash = await webCryptoDigest.sha256(new TextEncoder().encode("abc"));
    expect(bytesToHex(hash)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
