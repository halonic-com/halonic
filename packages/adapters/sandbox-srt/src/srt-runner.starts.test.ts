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
  execFile: () => {
    throw new Error("the test never starts a process");
  },
}));

const { srtRunner } = await import("./srt-runner.ts");

const request = {
  settingsPath: "/session/srt-settings.json",
  cwd: "/w",
  launcherEnv: {},
  programEnv: {},
  withoutSrtEnv: false,
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
      [
        "a script joined to an option with = (HAL-3628)",
        { program: "node", args: ["--require=skills/mail/scripts/send.js"] },
      ],
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

    it("starts a program without network from an empty environment, with only its own variables", async () => {
      // Windows has no `env`; its command line is checked in srt-runner.test.ts.
      if (process.platform === "win32") return expect(process.platform).toBe("win32");
      const commandOf = async (withoutSrtEnv: boolean): Promise<string[]> => {
        spawned.length = 0;
        const run = { ...request, programEnv: { TMPDIR: "/t" }, withoutSrtEnv };
        await expect(
          srtRunner.run({ ...run, program: "/bin/node", args: ["r.js"] }),
        ).rejects.toThrow(/never starts a process/);
        const [, args] = spawned[0] as [string, string[]];
        return args.slice(args.indexOf("--") + 1);
      };
      expect(await commandOf(true)).toEqual([
        "env",
        "-i",
        "TMPDIR=/t",
        expect.stringMatching(/^HALONIC_SRT_RUN=/),
        "/bin/node",
        "r.js",
      ]);
      expect((await commandOf(false)).slice(0, 2)).toEqual(["env", "TMPDIR=/t"]);
      // The other tests expect nothing started; they may run after this one.
      spawned.length = 0;
    });
  });
});
