import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";

// Every process the runner starts goes through this fake, so the test sees
// each one and nothing really runs.
const spawned = vi.hoisted(() => [] as unknown[]);
vi.mock("node:child_process", () => ({
  spawn: (...call: unknown[]) => {
    spawned.push(call);
    throw new Error("the test never starts a process");
  },
}));

const { srtRunner } = await import("./srt-runner.ts");

const request = {
  settingsPath: "/session/srt-settings.json",
  cwd: "/w",
  launcherEnv: {},
  programEnv: {},
};

verifies("sandbox-srt.session", () => {
  describe("what the runner starts", () => {
    it.each([
      ["an absolute program", { program: "/w/library/skills/mail/scripts/send", args: [] }],
      ["a Windows-style program", { program: "skills\\mail\\scripts\\send.ps1", args: [] }],
      ["a mixed-case program", { program: "/w/Skills/mail/Scripts/send", args: [] }],
      [
        "a mixed-case Windows-style program",
        { program: "SKILLS\\mail\\Scripts\\send.ps1", args: [] },
      ],
      ["a script as an argument", { program: "node", args: ["skills/mail/scripts/send.js"] }],
      ["a relative script", { program: "sh", args: ["./scripts/send"], cwd: "/w/skills/mail" }],
      [
        "a start inside the script folder",
        { program: "sh", args: [], cwd: "/w/skills/mail/scripts" },
      ],
    ])(
      "refuses %s under a skill's scripts/ folder and starts nothing, whoever calls it (HAL-188)",
      async (_, bad) => {
        await expect(srtRunner.run({ ...request, ...bad })).rejects.toThrow(
          /skill's scripts\/ folder/,
        );
        expect(spawned).toEqual([]);
      },
    );

    it("refuses a link that leads into a skill's scripts/ folder and starts nothing (HAL-3011)", async () => {
      const work = await mkdtemp(join(tmpdir(), "halonic-srt-runner-"));
      try {
        const scripts = join(work, "skills", "mail", "scripts");
        await mkdir(scripts, { recursive: true });
        await writeFile(join(scripts, "send"), "#!/bin/sh\n");
        await symlink(join(scripts, "send"), join(work, "innocent"));
        for (const bad of [
          { program: "./innocent", args: [] },
          { program: "sh", args: ["innocent"] },
        ]) {
          await expect(srtRunner.run({ ...request, cwd: work, ...bad })).rejects.toThrow(
            /skill's scripts\/ folder/,
          );
        }
        expect(spawned).toEqual([]);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    });
  });
});
