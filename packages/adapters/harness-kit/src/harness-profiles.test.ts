import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessAgent } from "@halonicjs/engine";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type HarnessAgentFile,
  type HarnessProfileHost,
  HarnessProfiles,
  type HarnessProfilesOptions,
} from "./harness-profiles.ts";

const bridge = { url: "http://127.0.0.1:41817", token: "run-token" };

/** A made-up computer in a temp folder: a home folder with a workspace in it, and Halonic's data. */
interface Computer {
  readonly home: string;
  readonly workspace: string;
  readonly data: string;
  readonly proposal: string;
}

let computer: Computer;

beforeEach(async () => {
  const top = await realpath(await mkdtemp(join(tmpdir(), "harness-profile-")));
  const home = join(top, "home");
  const workspace = join(home, "work", "acme");
  const data = join(top, "data");
  const proposal = join(data, "workspaces", "k1", "proposals", "run_1");
  const folders = [
    join(home, ".ssh"),
    join(home, ".aws"),
    join(home, ".claude"),
    join(workspace, "agents"),
    join(workspace, ".git", "hooks"),
    join(proposal, "agents"),
    join(data, "workspaces", "k1", "proposals", "run_2"),
    join(data, "agent-host"),
    join(data, "tmp", "run_1"),
    join(data, "settings", "writer"),
  ];
  for (const folder of folders) await mkdir(folder, { recursive: true });
  await writeFile(join(proposal, ".git"), "gitdir: elsewhere\n");
  computer = { home, workspace, data, proposal };
});

afterEach(async () => {
  await rm(join(computer.home, ".."), { recursive: true, force: true });
});

function agentWith(filesFolder: string | null): HarnessAgent {
  return { runId: "run_1", hubId: "main", agentId: "writer", filesFolder };
}

function profilesWith(
  file: Partial<HarnessAgentFile> = {},
  options: Partial<HarnessProfilesOptions> = {},
  host: Partial<HarnessProfileHost> = {},
): HarnessProfiles {
  return new HarnessProfiles({
    workspace: computer.workspace,
    halonicData: computer.data,
    home: computer.home,
    host: {
      agentFile: async () => ({
        workingFolder: null,
        allowedSites: ["docs.acme.test"],
        install: { program: join(computer.home, ".local", "bin", "claude"), packageFolder: null },
        ...file,
      }),
      tempFolder: async () => join(computer.data, "tmp", "run_1"),
      settingsFolder: async () => join(computer.data, "settings", "writer"),
      ...host,
    },
    env: { PATH: "/usr/bin" },
    timeLimitMs: 600_000,
    platform: "linux",
    ...options,
  });
}

verifies("harness-kit.harness-profile", () => {
  describe("HarnessProfiles", () => {
    it("builds a profile in the workspace when the agent has no proposal folder", async () => {
      const { data, home, workspace } = computer;

      const { profile, deniedGroups } = await profilesWith().profileOf(agentWith(null), bridge);

      expect(profile.workingFolder).toBe(join(workspace, "files", "agents", "writer"));
      expect(profile.readOnlyPaths).toEqual([join(workspace, ".git"), join(workspace, "agents")]);
      expect(profile.env).toEqual({ PATH: "/usr/bin", TMPDIR: join(data, "tmp", "run_1") });
      expect(profile.network).toEqual({
        bridge: { host: "127.0.0.1", port: 41817 },
        allowedSites: ["docs.acme.test"],
      });
      expect(deniedGroups.map(({ code }) => code)).toEqual([
        "ssh-keys",
        "cloud-sign-ins",
        "agent-settings",
        "halonic-data",
      ]);
      expect(deniedGroups[0]?.paths).toEqual([join(home, ".ssh")]);
      const hidden = deniedGroups.find(({ code }) => code === "halonic-data")?.paths ?? [];
      expect([...hidden].sort()).toEqual([join(data, "agent-host"), join(data, "workspaces")]);
      expect(profile.deniedPaths).toEqual(deniedGroups.flatMap(({ paths }) => paths));
    });

    it("works in the proposal folder, writes nowhere in the workspace, and denies the rest of the data", async () => {
      const { data, proposal, workspace } = computer;

      const { profile, deniedGroups } = await profilesWith().profileOf(agentWith(proposal), bridge);

      expect(profile.workingFolder).toBe(join(proposal, "files", "agents", "writer"));
      for (const writable of [profile.workingFolder, profile.tempFolder, profile.settingsFolder]) {
        expect(writable?.startsWith(workspace)).toBe(false);
      }
      expect(profile.readOnlyPaths).toEqual([join(proposal, ".git"), join(proposal, "agents")]);
      const hidden = deniedGroups.find(({ code }) => code === "halonic-data")?.paths ?? [];
      expect(hidden).toContain(join(data, "agent-host"));
      expect(hidden).toContain(join(data, "workspaces", "k1", "proposals", "run_2"));
      expect(hidden.some((path) => proposal.startsWith(path))).toBe(false);
    });

    it("refuses a working folder whose link leads out of the folder it works in", async () => {
      const { proposal, workspace } = computer;
      await symlink(workspace, join(proposal, "files"), "junction");

      await expect(profilesWith().profileOf(agentWith(proposal), bridge)).rejects.toThrow(
        /leads out of/,
      );
    });

    it("refuses a working folder that is really in .git", async () => {
      const { workspace } = computer;
      await symlink(join(workspace, ".git", "hooks"), join(workspace, "files"), "junction");

      await expect(profilesWith().profileOf(agentWith(null), bridge)).rejects.toThrow(
        /is really .*where it can't work/,
      );
    });

    it("refuses a working folder through a link to a folder that isn't there", async () => {
      const { workspace } = computer;
      await symlink(join(workspace, "missing"), join(workspace, "files"), "junction");

      await expect(profilesWith().profileOf(agentWith(null), bridge)).rejects.toThrow(
        /can't be made at/,
      );
    });

    it("refuses a working folder named into .git", async () => {
      await expect(
        profilesWith({ workingFolder: ".git/hooks" }).profileOf(agentWith(null), bridge),
      ).rejects.toThrow(/can't write in '.git'/);
    });

    it("refuses a working folder that holds Halonic's data folder", async () => {
      const data = join(computer.workspace, "files", "agents", "writer", "halonic");
      await mkdir(join(data, "tmp", "run_1"), { recursive: true });
      const host = {
        tempFolder: async () => join(data, "tmp", "run_1"),
        settingsFolder: async () => null,
      };

      await expect(
        profilesWith({}, { halonicData: data }, host).profileOf(agentWith(null), bridge),
      ).rejects.toThrow(/overlaps Halonic's data folder/);
    });

    it.each([
      ["the home folder holds it", ".local/share/halonic"],
      ["it is a folder of the workspace", ".halonic"],
    ])("denies Halonic's data folder in a workspace when %s", async (_, inWorkspace) => {
      const workspace = computer.home;
      const data = join(workspace, ...inWorkspace.split("/"));
      for (const folder of ["agent-host", join("tmp", "run_1"), join("settings", "writer")]) {
        await mkdir(join(data, folder), { recursive: true });
      }
      const host = {
        tempFolder: async () => join(data, "tmp", "run_1"),
        settingsFolder: async () => join(data, "settings", "writer"),
      };

      const { deniedGroups } = await profilesWith(
        {},
        { workspace, halonicData: data },
        host,
      ).profileOf(agentWith(null), bridge);

      const hidden = deniedGroups.find(({ code }) => code === "halonic-data")?.paths ?? [];
      expect(hidden).toContain(join(data, "agent-host"));
      expect(hidden).not.toContain(join(data, "tmp", "run_1"));
      expect(hidden).not.toContain(join(data, "settings", "writer"));
    });

    it("refuses a proposal folder in the workspace", async () => {
      const inWorkspace = join(computer.workspace, "proposal");
      await mkdir(inWorkspace);

      await expect(profilesWith().profileOf(agentWith(inWorkspace), bridge)).rejects.toThrow(
        /must be in Halonic's data folder and outside the workspace/,
      );
    });

    it("refuses a temp folder outside Halonic's data folder", async () => {
      const tempFolder = async () => join(computer.workspace, "agents");

      await expect(
        profilesWith({}, {}, { tempFolder }).profileOf(agentWith(null), bridge),
      ).rejects.toThrow(/The temp folder .* must be in Halonic's data folder/);
    });

    it("refuses a workspace that a denied group holds", async () => {
      const workspace = join(computer.home, ".aws", "acme");
      await mkdir(workspace);

      await expect(
        profilesWith({}, { workspace }).profileOf(agentWith(null), bridge),
      ).rejects.toThrow(/which the sandbox denies \(cloud-sign-ins\)/);
    });

    it("names the harness's folder in the user profile read-only on Windows", async () => {
      const bin = join(computer.home, ".local", "bin");
      await mkdir(bin, { recursive: true });
      await writeFile(join(bin, "claude"), "");

      const { profile } = await profilesWith({}, { platform: "win32" }).profileOf(
        agentWith(null),
        bridge,
      );

      expect(profile.readOnlyPaths).toContain(bin);
      expect(profile.readOnlyPaths).not.toContain(computer.home);
    });
  });
});
