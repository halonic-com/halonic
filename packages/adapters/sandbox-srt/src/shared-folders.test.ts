import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSharedFolders, WSL_SHARED_FOLDERS } from "./shared-folders.ts";
import { buildSrtConfig } from "./srt-config.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

let base: string;
let home: string;
let mounts: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "srt-shared-")));
  home = join(base, "home");
  mounts = join(base, "mnt");
  for (const folder of ["projects/a", "projects/b", "data/runs/1/temp", "data/agents/x"]) {
    await mkdir(join(home, folder), { recursive: true });
  }
  await mkdir(join(mounts, "c"), { recursive: true });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** A session working in project `a`, with its temp and settings folders in the data folder. */
function onProjectA() {
  return makeProfile(base, {
    workingFolder: join(home, "projects", "a"),
    tempFolder: join(home, "data", "runs", "1", "temp"),
    settingsFolder: join(home, "data", "agents", "x"),
    readOnlyPaths: [join(home, ".local", "harness")],
  });
}

/** The paths of one list in srt's settings. */
function paths(entries: readonly (string | { path: string })[] | undefined): string[] {
  return (entries ?? []).map((entry) => (typeof entry === "string" ? entry : entry.path));
}

verifies("sandbox-srt.shared-folders", () => {
  describe("the settings for shared folders", () => {
    it("deny each shared folder for reading as a whole, not entry by entry", () => {
      const { filesystem } = buildSrtConfig(onProjectA(), [], [], "linux", [home, mounts]);
      const denied = paths(filesystem?.denyRead);
      expect(denied).toEqual(expect.arrayContaining([home, mounts]));
      expect(denied).not.toContain(join(home, "projects", "b"));
    });

    it("re-allow the session's own folders inside them for reading", () => {
      const { filesystem } = buildSrtConfig(onProjectA(), [], [], "linux", [home]);
      expect(paths(filesystem?.allowRead)).toEqual(
        expect.arrayContaining([
          join(home, "projects", "a"),
          join(home, "data", "runs", "1", "temp"),
          join(home, "data", "agents", "x"),
          join(home, ".local", "harness"),
        ]),
      );
      expect(paths(filesystem?.allowRead)).not.toContain(join(home, "projects"));
    });

    it("leave the session's own folders writable: a shared folder is not denied for writing", () => {
      const { filesystem } = buildSrtConfig(onProjectA(), [], [], "linux", [home]);
      expect(paths(filesystem?.allowWrite)).toContain(join(home, "projects", "a"));
      expect(paths(filesystem?.denyWrite)).not.toContain(home);
    });

    it("re-allow nothing on Linux without shared folders", () => {
      expect(buildSrtConfig(onProjectA(), [], [], "linux").filesystem?.allowRead).toBeUndefined();
    });
  });

  describe("opening a session with shared folders", () => {
    it("writes the whole-folder deny into the settings", async () => {
      const { runner, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner, null, {
        sharedFolders: [home, mounts],
      }).open(onProjectA());
      const config = JSON.parse(readFileSync(probes[0]?.settingsPath ?? "", "utf8"));
      expect(paths(config.filesystem.denyRead)).toEqual(expect.arrayContaining([home, mounts]));
      expect(paths(config.filesystem.allowRead)).toContain(join(home, "projects", "a"));
      await session.close();
    });

    it("doesn't open when a shared folder is missing", async () => {
      const { runner, probes } = fakeRunner();
      const sandbox = new SrtSandbox(linux, runner, null, {
        sharedFolders: [home, join(base, "nowhere")],
      });
      await expect(sandbox.open(onProjectA())).rejects.toThrow("can't be hidden");
      expect(probes).toEqual([]);
    });

    it("doesn't open when a shared folder is a file", async () => {
      const file = join(base, "file");
      await writeFile(file, "");
      await expect(assertSharedFolders([file])).rejects.toThrow("it isn't a folder");
    });
  });
});

verifies("sandbox-srt.shared-folders", () => {
  it("names the distro's home, its Windows-drive mounts and /mnt/wsl for srt-wsl", () => {
    expect(WSL_SHARED_FOLDERS).toEqual([`/${"home"}/halonic`, "/mnt/halonic", "/mnt/wsl"]);
  });
});
