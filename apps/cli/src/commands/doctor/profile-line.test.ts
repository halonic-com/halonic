import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorMachine } from "../../doctor-machine.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { profilePlatformOf } from "../../workspace-runs.ts";
import { createDoctorCommand } from "./command.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-doctor-profile-"));
  // The home folder is the test's own folder, so the built-in profile is in it.
  vi.stubEnv("HOME", folder);
  vi.stubEnv("USERPROFILE", folder);
  vi.stubEnv("HALONIC_HOME", "");
  vi.stubEnv("XDG_DATA_HOME", "");
  vi.stubEnv("LOCALAPPDATA", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(folder, { recursive: true, force: true });
});

/** A computer whose profile is `profileRoot`, with a sandbox that starts and no harness. */
function machine(profileRoot: string): DoctorMachine {
  return {
    profile: { platform: profilePlatformOf(process.platform), root: profileRoot },
    trustStore: {
      get: async () => null,
      grant: async () => {},
      revoke: async () => {},
      list: async () => [],
    },
    sandbox: {
      check: async () => ({ ok: true, reason: null, missing: [] }),
      capabilities: () => ({ files: "shared", strength: "os" }),
    },
    sandboxKind: "bubblewrap",
    probe: {
      engineMemory: async () => 0,
      childProcesses: async () => [],
      folderSize: async () => ({ bytes: 0, complete: true }),
      freeDisk: async () => 48 * 1024 ** 3,
    },
    harnesses: [],
    http: { fetch: async () => new Response("{}") },
    system: "Linux x64",
    signInShell: "sh",
  };
}

/** Writes a workspace with only `workspace.yaml` to `root`. */
function writeWorkspace(root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "workspace.yaml"), "id: acme\nname: Acme\n");
}

async function doctorIn(cwd: string, profileRoot: string, ...args: string[]) {
  const io = captureIo(cwd);
  const code = await runCli(["doctor", ...args], io, [
    createDoctorCommand(() => machine(profileRoot)),
  ]);
  return { code, io };
}

verifies("cli.commands.doctor.profile-line", () => {
  describe("the Profile line", () => {
    it("comes first and fails when HALONIC_HOME is inside the workspace, without the Workspace line", async () => {
      const acme = join(folder, "acme");
      writeWorkspace(acme);
      vi.stubEnv("HALONIC_HOME", join(acme, ".profile"));

      const { code, io } = await doctorIn(folder, join(acme, ".profile"), "--dir", "acme");

      expect(code).toBe(exitCode.failed);
      expect(io.stdout[2]).toBe(
        "✕ Profile     the profile folder HALONIC_HOME is inside this workspace.",
      );
      expect(io.stdout[3]).toBe(
        "              Fix: move it out of the workspace and set HALONIC_HOME to its new place, so a change in the workspace can't change your trust records.",
      );
      expect(io.stdout.some((line) => line.includes("Workspace"))).toBe(false);
    });

    it("fails, instead of throwing, when the workspace is inside the profile", async () => {
      const profile = join(folder, "profile");
      const acme = join(profile, "acme");
      writeWorkspace(acme);
      vi.stubEnv("HALONIC_HOME", profile);

      const { code, io } = await doctorIn(acme, profile, "--json");

      expect(code).toBe(exitCode.failed);
      const report = JSON.parse(io.stdout.join("\n"));
      expect(report.checks[0]).toEqual({
        check: "profile",
        status: "failed",
        problem: "workspace-in-profile",
        // The home folder is the test's folder, so the profile is shown under `~`.
        profile: join("~", "profile"),
      });
      expect(report.problems).toBe(1);
    });

    it("isn't there, and doctor passes, in a folder without workspace.yaml that holds HALONIC_HOME", async () => {
      vi.stubEnv("HALONIC_HOME", join(folder, ".halonic"));

      const { code, io } = await doctorIn(folder, join(folder, ".halonic"));

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.some((line) => line.includes("Profile"))).toBe(false);
    });

    it("isn't there for a --dir without workspace.yaml, which is still no workspace", async () => {
      mkdirSync(join(folder, "acme"));
      vi.stubEnv("HALONIC_HOME", join(folder, "acme", ".profile"));

      const { code, io } = await doctorIn(
        folder,
        join(folder, "acme", ".profile"),
        "--dir",
        "acme",
      );

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr[0]).toContain("there's no workspace.yaml here.");
    });

    it("isn't there for a --dir inside the profile without workspace.yaml, which is no workspace", async () => {
      const profile = join(folder, "profile");
      mkdirSync(join(profile, "empty"), { recursive: true });
      vi.stubEnv("HALONIC_HOME", profile);

      const { code, io } = await doctorIn(folder, profile, "--dir", join(profile, "empty"));

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr[0]).toContain("there's no workspace.yaml here.");
    });

    it("checks only the computer in a folder inside the profile without workspace.yaml", async () => {
      const profile = join(folder, "profile");
      const empty = join(profile, "empty");
      mkdirSync(empty, { recursive: true });
      vi.stubEnv("HALONIC_HOME", profile);

      const { code, io } = await doctorIn(empty, profile);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.some((line) => line.includes("Profile"))).toBe(false);
      expect(io.stdout.some((line) => line.includes("Workspace"))).toBe(false);
    });

    it("isn't there for a sibling folder whose name starts the same", async () => {
      const acme = join(folder, "acme");
      writeWorkspace(acme);
      vi.stubEnv("HALONIC_HOME", join(folder, "acme-profile"));

      const { io } = await doctorIn(folder, join(folder, "acme-profile"), "--dir", "acme");

      expect(io.stdout.some((line) => line.includes("Profile"))).toBe(false);
      expect(io.stdout.some((line) => line.includes("Workspace"))).toBe(true);
    });
  });
});
