import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Machine } from "./machine.ts";
import { assertSrtDeniesKeychain } from "./srt-config.ts";
import type { Runner } from "./srt-runner.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { endedProgram } from "./srt-session.test-helper.ts";

/** Whether srt's schema acts as if our patch of srt had stopped applying. */
const srt = vi.hoisted(() => ({ withoutPatch: false }));

// Without our patch, srt's schema doesn't know `denyMachLookup` and drops it without an error.
vi.mock(import("@anthropic-ai/sandbox-runtime"), async (importOriginal) => {
  const original = await importOriginal();
  const schema = original.SandboxRuntimeConfigSchema;
  return {
    ...original,
    SandboxRuntimeConfigSchema: {
      ...schema,
      parse(value: unknown) {
        const parsed = schema.parse(value);
        if (srt.withoutPatch)
          delete (parsed.network as { denyMachLookup?: unknown }).denyMachLookup;
        return parsed;
      },
    } as typeof schema,
  };
});

afterEach(() => {
  srt.withoutPatch = false;
});

/** A Linux machine that can start the sandbox. */
const machine: Machine = {
  platform: "linux",
  insideContainer: async () => false,
  isWsl1: async () => false,
  hasBubblewrap: async () => true,
  missingLinuxHelpers: async () => [],
  bubblewrapUserNamespaceError: async () => null,
  appArmorRestrictsUserNamespaces: async () => false,
  hasRipgrep: async () => true,
  hasSeatbelt: async () => true,
  hasWindowsSandbox: async () => false,
  installWindowsSandbox: async () => "installed" as const,
  letSandboxReadParents: async () => undefined,
  uninstallWindowsSandbox: async () => "removed" as const,
  forgetSandboxParents: async () => undefined,
};

function profile(keyStore?: SandboxProfile["keyStore"]): SandboxProfile {
  return {
    workingFolder: "/work/acme",
    tempFolder: "/scratch/hs-1",
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 60_000,
    ...(keyStore === undefined ? {} : { keyStore }),
  };
}

verifies("sandbox-srt.profile-to-srt-config", () => {
  describe("the key store deny when srt drops it", () => {
    it("passes while srt keeps the deny of every Keychain service", async () => {
      await expect(assertSrtDeniesKeychain(profile("denied"))).resolves.toBeUndefined();
    });

    it("refuses to open a session that denies the key store once srt drops the deny", async () => {
      srt.withoutPatch = true;
      // The ready check's `true` ends at once; the session's own programs must never start.
      const started: string[] = [];
      const runner: Runner = {
        run: async (request) => {
          started.push(request.program);
          return endedProgram(0);
        },
      };
      const sandbox = new SrtSandbox(machine, runner);
      await expect(sandbox.open(profile("denied"))).rejects.toThrow(
        "srt dropped the deny of com.apple.SecurityServer, com.apple.securityd.xpc",
      );
      expect(started).toEqual(["true"]);
    });

    it("doesn't ask srt about a profile that allows the key store or leaves it out", async () => {
      srt.withoutPatch = true;
      await expect(assertSrtDeniesKeychain(profile("allowed"))).resolves.toBeUndefined();
      await expect(assertSrtDeniesKeychain(profile())).resolves.toBeUndefined();
    });
  });
});
