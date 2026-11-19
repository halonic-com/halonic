import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dockerDesktopShows } from "./docker-desktop.ts";
import type { Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { endedProgram } from "./srt-session.test-helper.ts";

/** A Linux machine that can start the sandbox, where Docker Desktop shows or not. */
function linux(dockerDesktopVisible: Machine["dockerDesktopVisible"]): Machine {
  return {
    platform: "linux",
    insideContainer: async () => false,
    isWsl1: async () => false,
    hasBubblewrap: async () => true,
    missingLinuxHelpers: async () => [],
    hasRipgrep: async () => true,
    bubblewrapUserNamespaceError: async () => null,
    appArmorRestrictsUserNamespaces: async () => false,
    hasSeatbelt: async () => false,
    packageManager: async () => null,
    windowsSandboxState: async () => "setup-needed" as const,
    ...(dockerDesktopVisible === undefined ? {} : { dockerDesktopVisible }),
    installWindowsSandbox: async () => "installed" as const,
    letSandboxReadParents: async () => undefined,
    uninstallWindowsSandbox: async () => "removed" as const,
    forgetSandboxParents: async () => undefined,
  };
}

/** The sandbox on `machine`, in the distro when `inDistro`, with a runner that runs nothing for real. */
function srt(machine: Machine, inDistro: boolean): SrtSandbox {
  return new SrtSandbox(machine, { run: async () => endedProgram(0) }, null, {
    ...(inDistro ? { sharedFolders: ["/contract/shared"] } : {}),
  });
}

verifies("sandbox-srt.wsl-start-checks", () => {
  describe("SrtSandbox.check in Halonic's WSL distro", () => {
    it("reports docker-desktop-visible on a check that passes, when Docker Desktop shows", async () => {
      expect(
        await srt(
          linux(async () => true),
          true,
        ).check(),
      ).toEqual({
        ok: true,
        reason: null,
        missing: [],
        residuals: ["docker-desktop-visible"],
      });
    });

    it("reports no residual when Docker Desktop doesn't show", async () => {
      expect(
        await srt(
          linux(async () => false),
          true,
        ).check(),
      ).toEqual({
        ok: true,
        reason: null,
        missing: [],
      });
    });

    it("asks again at every check, so Docker Desktop started after the setup shows", async () => {
      let running = false;
      const sandbox = srt(
        linux(async () => running),
        true,
      );
      expect(await sandbox.check()).not.toHaveProperty("residuals");
      running = true;
      expect(await sandbox.check()).toMatchObject({ residuals: ["docker-desktop-visible"] });
    });

    it("counts a machine that fails to answer as Docker Desktop", async () => {
      const check = await srt(
        linux(async () => {
          throw new Error("unreadable");
        }),
        true,
      ).check();
      expect(check).toMatchObject({ ok: true, residuals: ["docker-desktop-visible"] });
    });

    it("doesn't look outside the distro", async () => {
      let asked = false;
      const check = await srt(
        linux(async () => {
          asked = true;
          return true;
        }),
        false,
      ).check();
      expect(check).toEqual({ ok: true, reason: null, missing: [] });
      expect(asked).toBe(false);
    });
  });

  describe("dockerDesktopShows", () => {
    let root: string;
    let socket: string;
    let shared: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "halonic-docker-"));
      socket = join(root, "docker.sock");
      shared = join(root, "wsl");
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it("is false with neither the socket nor the shared folder", async () => {
      expect(await dockerDesktopShows(socket, shared)).toBe(false);
    });

    it("is false with a shared folder that has no docker-desktop entry", async () => {
      await mkdir(join(shared, "Ubuntu"), { recursive: true });
      expect(await dockerDesktopShows(socket, shared)).toBe(false);
    });

    it("is true for a docker-desktop entry in the shared folder", async () => {
      await mkdir(join(shared, "docker-desktop-bind-mounts"), { recursive: true });
      expect(await dockerDesktopShows(socket, shared)).toBe(true);
    });

    it("is true for the socket, also when it is a link to nowhere, as it isn't followed", async () => {
      await symlink(join(root, "gone"), socket);
      expect(await dockerDesktopShows(socket, shared)).toBe(true);
    });

    it("is true for a shared folder that can't be read", async () => {
      await writeFile(shared, "not a folder");
      expect(await dockerDesktopShows(socket, shared)).toBe(true);
    });
  });
});
