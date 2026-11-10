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
  });
});
