import { mkdir, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Harness, Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writerAgent, writerFile } from "./harness-agent.test-helper.ts";
import { HarnessProfiles } from "./harness-profiles.ts";
import {
  profileHostDiskOnThisComputer,
  WorkspaceHarnessHost,
  type WorkspaceHarnessHostOptions,
} from "./profile-host.ts";

const install = { program: "/usr/local/bin/claude", packageFolder: null };

/** A harness that does nothing; with a sign-in, it has a settings folder variable. */
function harnessWith(signIn: Harness["signIn"]): Harness {
  return {
    id: "claude-code",
    name: "Claude Code",
    detect: async () => ({ status: "missing" }),
    start: () => {
      throw new Error("Not started in these tests.");
    },
    ...(signIn === undefined ? {} : { signIn }),
  };
}

const claudeCode = harnessWith({
  program: "claude",
  args: ["auth", "login"],
  folderVariable: "CLAUDE_CONFIG_DIR",
});

/** A sandbox whose sessions only count how often they were closed. */
class FakeSandbox implements Sandbox {
  closed = 0;
  failsToOpen = false;

  check: Sandbox["check"] = async () => ({ ok: true, reason: null, missing: [] });
  capabilities: Sandbox["capabilities"] = () => ({ files: "shared", strength: "os" });

  async open(profile: SandboxProfile): Promise<SandboxSession> {
    if (this.failsToOpen) throw new Error("The fence didn't start.");
    return {
      profile,
      fence: { state: "fenced" },
      start: async () => {
        throw new Error("Not started in these tests.");
      },
      onBlocked: () => () => {},
      close: async () => {
        this.closed += 1;
      },
    };
  }
}

/** A profile with only the temp folder that matters here. */
function profileWith(tempFolder: string): SandboxProfile {
  return {
    workingFolder: "/work",
    tempFolder,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 1000,
  };
}

let data: string;

beforeEach(async () => {
  data = await realpath(await mkdtemp(join(tmpdir(), "profile-host-")));
});

afterEach(async () => {
  await rm(data, { recursive: true, force: true });
});

function hostWith(options: Partial<WorkspaceHarnessHostOptions> = {}): WorkspaceHarnessHost {
  return new WorkspaceHarnessHost({
    settingsFolders: {
      harnessSettingsFolder: (agentId, harnessId) =>
        join(data, "workspaces", "k1", "harness-settings", agentId, harnessId),
    },
    tempRoot: join(data, "workspaces", "k1", "harness-temp"),
    harnesses: { "claude-code": claudeCode },
    installOf: async () => install,
    ...options,
  });
}

/** Whether only the user may list, read and write the folder; Windows has no such mode. */
async function isPrivate(folder: string): Promise<boolean> {
  if (process.platform === "win32") return true;
  return ((await stat(folder)).mode & 0o077) === 0;
}

verifies("harness-kit.profile-host", () => {
  describe("agentFile", () => {
    it("gives the working folder and sites from the file the call read, and the harness's install", async () => {
      const file = writerFile({ workingFolder: "drafts", allowedSites: ["docs.acme.test"] });
      const asked: string[] = [];
      const host = hostWith({
        installOf: async (harness) => {
          asked.push(harness);
          return install;
        },
      });

      expect(await host.agentFile(writerAgent(null, file))).toEqual({
        workingFolder: "drafts",
        allowedSites: ["docs.acme.test"],
        install,
      });
      expect(asked).toEqual(["claude-code"]);
    });

    it("gives no working folder and no sites when the file names none", async () => {
      const found = await hostWith().agentFile(writerAgent(null));

      expect(found).toMatchObject({ workingFolder: null, allowedSites: [] });
    });
  });

  describe("settingsFolder", () => {
    it("makes the agent's private folder for its harness", async () => {
      const folder = await hostWith().settingsFolder(writerAgent(null));

      expect(folder).toBe(
        join(data, "workspaces", "k1", "harness-settings", "writer", "claude-code"),
      );
      expect(await isPrivate(folder ?? "")).toBe(true);
    });

    it("gives none, and makes nothing, for a harness without a sign-in folder", async () => {
      const host = hostWith({ harnesses: { "claude-code": harnessWith(undefined) } });

      expect(await host.settingsFolder(writerAgent(null))).toBeNull();
      expect(await readdir(data)).toEqual([]);
    });

    it("gives none for a harness the host doesn't offer", async () => {
      const host = hostWith({ harnesses: {} });

      expect(await host.settingsFolder(writerAgent(null))).toBeNull();
    });
  });

  describe("tempFolder", () => {
    it("makes a new, empty, private folder each time, at its real place", async () => {
      const host = hostWith();

      const first = await host.tempFolder(writerAgent(null));
      const second = await host.tempFolder(writerAgent(null));

      expect(first).not.toBe(second);
      for (const folder of [first, second]) {
        expect(folder.startsWith(join(data, "workspaces", "k1", "harness-temp"))).toBe(true);
        expect(await realpath(folder)).toBe(folder);
        expect(await readdir(folder)).toEqual([]);
        expect(await isPrivate(folder)).toBe(true);
      }
    });
  });

  describe("removingTempFolders", () => {
    it("removes the session's temp folder once it has closed, once however often it is closed", async () => {
      const host = hostWith();
      const sandbox = new FakeSandbox();
      const folder = await host.tempFolder(writerAgent(null));
      const session = await host.removingTempFolders(sandbox).open(profileWith(folder));

      await session.close();
      await session.close();

      expect(sandbox.closed).toBe(1);
      await expect(stat(folder)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("keeps the session's profile and fence", async () => {
      const host = hostWith();
      const folder = await host.tempFolder(writerAgent(null));
      const session = await host.removingTempFolders(new FakeSandbox()).open(profileWith(folder));

      expect(session.profile.tempFolder).toBe(folder);
      expect(session.fence).toEqual({ state: "fenced" });
    });

    it("removes the temp folder at once when the session fails to open", async () => {
      const host = hostWith();
      const sandbox = new FakeSandbox();
      sandbox.failsToOpen = true;
      const folder = await host.tempFolder(writerAgent(null));

      await expect(host.removingTempFolders(sandbox).open(profileWith(folder))).rejects.toThrow(
        "The fence didn't start.",
      );

      await expect(stat(folder)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("never removes a temp folder it didn't make", async () => {
      const host = hostWith();
      const theirs = await mkdtemp(join(data, "theirs-"));
      const session = await host.removingTempFolders(new FakeSandbox()).open(profileWith(theirs));

      await session.close();

      expect(await readdir(theirs)).toEqual([]);
    });

    it("reports a temp folder it can't remove, and still closes", async () => {
      const leftovers: string[] = [];
      const host = hostWith({
        disk: {
          ...profileHostDiskOnThisComputer,
          removeFolder: async () => {
            throw new Error("The folder is in use.");
          },
        },
        onLeftoverTempFolder: (folder) => leftovers.push(folder),
      });
      const folder = await host.tempFolder(writerAgent(null));
      const session = await host.removingTempFolders(new FakeSandbox()).open(profileWith(folder));

      await session.close();

      expect(leftovers).toEqual([folder]);
    });

    it("passes check and capabilities on", async () => {
      const wrapped = hostWith().removingTempFolders(new FakeSandbox());

      expect(await wrapped.check()).toEqual({ ok: true, reason: null, missing: [] });
      expect(wrapped.capabilities()).toEqual({ files: "shared", strength: "os" });
    });
  });

  describe("with the profile builder", () => {
    it("gives folders the builder keeps writable, and the sandbox removes the temp folder", async () => {
      const workspace = join(data, "acme");
      const home = join(data, "home");
      await mkdir(workspace, { recursive: true });
      await mkdir(home, { recursive: true });
      const host = hostWith();
      const profiles = new HarnessProfiles({
        workspace,
        halonicData: join(data, "workspaces"),
        home,
        host,
        env: { PATH: "/usr/bin" },
        timeLimitMs: 600_000,
        platform: "linux",
      });
      const bridge = { url: "http://127.0.0.1:41817", token: "run-token" };

      const { profile } = await profiles.profileOf(writerAgent(null), bridge);
      const session = await host.removingTempFolders(new FakeSandbox()).open(profile);
      await session.close();

      expect(profile.settingsFolder).toBe(
        join(data, "workspaces", "k1", "harness-settings", "writer", "claude-code"),
      );
      expect(profile.deniedPaths).not.toContain(profile.settingsFolder);
      expect(profile.env["TMPDIR"]).toBe(profile.tempFolder);
      await expect(stat(profile.tempFolder)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });
});
