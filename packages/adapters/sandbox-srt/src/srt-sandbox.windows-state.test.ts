import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { endedProgram } from "./srt-session.test-helper.ts";

/** A Windows machine whose srt install is in `state`; nothing else is asked of it here. */
function windows(state: Awaited<ReturnType<Machine["windowsSandboxState"]>>): Machine {
  return {
    platform: "win32",
    insideContainer: async () => false,
    isWsl1: async () => false,
    hasBubblewrap: async () => false,
    missingLinuxHelpers: async () => [],
    hasRipgrep: async () => false,
    bubblewrapUserNamespaceError: async () => null,
    appArmorRestrictsUserNamespaces: async () => false,
    hasSeatbelt: async () => false,
    packageManager: async () => null,
    windowsSandboxState: async () => state,
    installWindowsSandbox: async () => "installed" as const,
    letSandboxReadParents: async () => undefined,
    uninstallWindowsSandbox: async () => "removed" as const,
    forgetSandboxParents: async () => undefined,
  };
}

const profile: SandboxProfile = {
  workingFolder: "/contract/work",
  tempFolder: "/contract/temp",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 1000,
};

verifies("sandbox-srt.check", () => {
  describe("SrtSandbox.check on Windows", () => {
    it("reports setup-conflict, not setup-needed, for an install whose loopback mode isn't closed, and opens nothing", async () => {
      const sandbox = new SrtSandbox(windows("setup-conflict"), {
        run: async () => endedProgram(0),
      });
      const check = await sandbox.check();
      expect(check).toMatchObject({ ok: false, reason: "setup-conflict" });
      expect(check.missing[0]).toContain("loopback");
      await expect(sandbox.open(profile)).rejects.toThrow("can't start");
    });
  });
});
