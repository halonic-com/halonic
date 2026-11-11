import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxCommand, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// HAL-188: Halonic never runs a file under a skill's `scripts/` folder. This
// file is the launcher session's `scriptsTest` in
// `tooling/check/process-starters.json`. Every process it would start goes
// through this fake, so the test sees each one and nothing really runs.
const spawned = vi.hoisted(() => [] as unknown[]);
vi.mock("node:child_process", () => ({
  spawn: (...call: unknown[]) => {
    spawned.push(call);
    throw new Error("the test never starts a process");
  },
  execFile: () => {
    throw new Error("the test never starts a process");
  },
}));

const { createHostSandbox } = await import("./host-sandbox.ts");
const { startHostProgram } = await import("./host-process.ts");

let work = "";
// Windows needs extra rights to create a symbolic link; the link cases run on POSIX.
const withLinks = process.platform !== "win32";

beforeAll(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), "hs-scripts-")));
  const scripts = join(work, "skills", "mail", "scripts");
  await mkdir(scripts, { recursive: true });
  await writeFile(join(scripts, "send"), "#!/bin/sh\n");
  if (withLinks) await symlink(join(scripts, "send"), join(work, "innocent"));
});
afterAll(() => rm(work, { recursive: true, force: true }));

function profile(): SandboxProfile {
  return {
    workingFolder: work,
    tempFolder: work,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: { PATH: work },
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 30_000,
  };
}

verifies("sandbox-host.start", () => {
  describe("what a launcher session starts", () => {
    it.each<[string, SandboxCommand]>([
      ["an absolute program", { program: "/w/skills/mail/scripts/send", args: [] }],
      ["a Windows-style program", { program: "skills\\mail\\scripts\\send.ps1", args: [] }],
      ["a mixed-case program", { program: "/w/Skills/mail/Scripts/send", args: [] }],
      ["a script as an argument", { program: "node", args: ["skills/mail/scripts/send.js"] }],
      [
        "a script joined to an option with =",
        { program: "node", args: ["--require=skills/mail/scripts/send.js"] },
      ],
      ["a relative script", { program: "sh", args: ["./scripts/send"], cwd: "skills/mail" }],
      ["a start inside the script folder", { program: "sh", args: [], cwd: "skills/mail/scripts" }],
      ...(withLinks
        ? ([
            ["a link that leads into the script folder", { program: "./innocent", args: [] }],
            ["a link as an argument", { program: "sh", args: ["innocent"] }],
          ] satisfies [string, SandboxCommand][])
        : []),
    ])(
      "refuses %s under a skill's scripts/ folder and starts nothing (HAL-188)",
      async (_, bad) => {
        const session = await createHostSandbox().open(profile());
        await expect(session.start(bad)).rejects.toThrow(/skill's scripts\/ folder/);
        expect(spawned).toEqual([]);
        await session.close();
      },
    );

    it("refuses a script in the starter itself too, so no caller gets round the session's check", async () => {
      const send = join(work, "skills", "mail", "scripts", "send");
      for (const start of [
        { path: send, args: [], cwd: work },
        { path: "/usr/bin/node", args: [send], cwd: work },
        { path: "/usr/bin/node", args: [], cwd: join(work, "skills", "mail", "scripts") },
      ]) {
        await expect(startHostProgram({ ...start, env: {} })).rejects.toThrow(
          /skill's scripts\/ folder/,
        );
      }
      expect(spawned).toEqual([]);
    });
  });
});
