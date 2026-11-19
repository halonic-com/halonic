import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildSrtConfig } from "./srt-config.ts";

/** Patterns a Windows session may pass to srt unmarked. Empty: srt expands them at session start only. */
const allowedPatterns: readonly string[] = [];

verifies("sandbox-srt.windows-folder-deny", () => {
  it("passes every Windows path to srt as a literal path, never as a pattern", () => {
    const profile: SandboxProfile = {
      workingFolder: "%SystemDrive%\\work\\acme[1]",
      tempFolder: "%USERPROFILE%\\AppData\\Local\\halonic\\tmp\\run_1",
      settingsFolder: "%USERPROFILE%\\AppData\\Local\\halonic\\agents\\ada",
      readOnlyPaths: ["%USERPROFILE%\\.cargo\\bin", "%SystemDrive%\\work\\acme[1]\\halonic.yaml"],
      deniedPaths: ["%USERPROFILE%\\.ssh", "%USERPROFILE%\\.npmrc", "%USERPROFILE%\\keys*"],
      reopenedPaths: [],
      env: {},
      network: { bridge: null, allowedSites: [] },
      timeLimitMs: 60_000,
    };
    const { filesystem } = buildSrtConfig(
      profile,
      ["%USERPROFILE%\\AppData\\Local\\halonic\\canary?"],
      [".git\\hooks"],
      "win32",
      ["%USERPROFILE%\\projects"],
      ["%USERPROFILE%\\.local\\bin"],
    );
    const entries = [
      ...(filesystem?.denyRead ?? []),
      ...(filesystem?.allowRead ?? []),
      ...(filesystem?.allowWrite ?? []),
      ...(filesystem?.denyWrite ?? []),
    ];
    expect(entries.length).toBeGreaterThan(10);
    const unmarked = entries.filter(
      (entry) =>
        (typeof entry === "string" && !allowedPatterns.includes(entry)) ||
        (typeof entry !== "string" && entry.literal !== true),
    );
    expect(unmarked).toEqual([]);
  });
});
