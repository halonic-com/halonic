import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxJournalFolder } from "@halonicjs/profile";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateJournalFolder, recoverSandboxSessions } from "./sandbox-journals.ts";

let base: string;
const profile = () => ({ platform: "linux" as const, root: join(base, "profile") });
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "halonic-cli-journals-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** The pid of a process that has ended. */
function deadPid(): number {
  const ended = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]);
  return Number(ended.stdout.toString());
}

describe("recoverSandboxSessions", () => {
  it.skipIf(process.platform === "win32")(
    "undoes a commondir that a crashed session left, then removes its journal",
    async () => {
      const git = join(base, "work", ".git");
      mkdirSync(git, { recursive: true });
      const commondir = join(git, "commondir");
      writeFileSync(commondir, "../elsewhere\n");
      const folder = sandboxJournalFolder(profile());
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(folder, "halonic-srt-crashed.json"),
        JSON.stringify({
          pid: deadPid(),
          gitFolder: git,
          originals: [[commondir, { kind: "absent" }]],
          folders: [git],
        }),
        { mode: 0o600 },
      );

      expect(await recoverSandboxSessions(profile)).toEqual([]);

      expect(existsSync(commondir)).toBe(false);
      expect(readdirSync(folder)).toEqual([]);
    },
  );

  it("does nothing when there is no journal folder yet", async () => {
    expect(await recoverSandboxSessions(profile)).toEqual([]);
    expect(existsSync(sandboxJournalFolder(profile()))).toBe(false);
  });

  it("does not throw when the recovery fails", async () => {
    const failing = async () => {
      throw new Error("disk");
    };
    expect(await recoverSandboxSessions(profile, failing)).toEqual([]);
  });

  it("does not throw when the profile folder can't be resolved", async () => {
    const unresolved = () => {
      throw new Error("HALONIC_HOME must be an absolute path");
    };
    expect(await recoverSandboxSessions(unresolved)).toEqual([]);
  });

  it("names the folder in the profile folder on every system, Windows included", () => {
    expect(privateJournalFolder(profile())).toBe(sandboxJournalFolder(profile()));
  });
});
