import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxCheckContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { cgroupNamesContainer, type Machine } from "./machine.ts";
import type { Runner } from "./srt-runner.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { endedProgram } from "./srt-session.test-helper.ts";

/** A Linux machine that can start the sandbox; each test spoils one thing. */
function machine(overrides: Partial<Machine> = {}): Machine {
  return {
    platform: "linux",
    insideContainer: async () => false,
    isWsl1: async () => false,
    hasBubblewrap: async () => true,
    missingLinuxHelpers: async () => [],
    bubblewrapUserNamespaceError: async () => null,
    appArmorRestrictsUserNamespaces: async () => false,
    hasSeatbelt: async () => true,
    hasWindowsSandbox: async () => false,
    installWindowsSandbox: async () => "installed" as const,
    letSandboxReadParents: async () => undefined,
    uninstallWindowsSandbox: async () => "removed" as const,
    forgetSandboxParents: async () => undefined,
    ...overrides,
  };
}

/** A runner whose every program, the ready check's `true` among them, ends at once with code 0. */
function runsTrue(): Runner {
  return { run: async () => endedProgram(0) };
}

/** The sandbox on `machine`, with a runner that runs nothing for real. */
function srt(on: Machine, runner: Runner = runsTrue()): SrtSandbox {
  return new SrtSandbox(on, runner);
}

sandboxCheckContract("srt", {
  make: async () => srt(machine()),
  makeUnavailable: async () => srt(machine({ hasBubblewrap: async () => false })),
});

verifies("sandbox-srt.check", () => {
  describe("SrtSandbox.check", () => {
    it("can start on a Linux machine with bubblewrap and user namespaces", async () => {
      expect(await srt(machine()).check()).toEqual({
        ok: true,
        reason: null,
        missing: [],
      });
    });

    it("says `other` instead of throwing when the machine can't be examined", async () => {
      const broken = machine({
        insideContainer: async () => {
          throw new Error("boom");
        },
      });
      const check = await srt(broken).check();
      expect(check.ok).toBe(false);
      expect(check.reason).toBe("other");
      expect(check.missing).toHaveLength(1);
    });

    /** A Linux machine where bubblewrap is there but can't make a user namespace. */
    const bubblewrapRefused = {
      bubblewrapUserNamespaceError: async () => "bwrap: setting up uid map: Permission denied",
    };

    it.each([
      ["setup-needed", { platform: "win32" as const }],
      ["container", { insideContainer: async () => true }],
      ["not-supported", { isWsl1: async () => true }],
      [
        "user-namespaces-restricted",
        { ...bubblewrapRefused, appArmorRestrictsUserNamespaces: async () => true },
      ],
      ["bubblewrap-missing", { hasBubblewrap: async () => false }],
      ["linux-tools-missing", { missingLinuxHelpers: async () => ["socat" as const] }],
      ["other", bubblewrapRefused],
      ["other", { platform: "darwin" as const, hasSeatbelt: async () => false }],
    ])("gives the reason %s", async (reason, overrides) => {
      const check = await srt(machine(overrides)).check();
      expect(check.reason).toBe(reason);
      expect(check.missing).toHaveLength(1);
    });

    it("gives the first reason in the port's order when several apply", async () => {
      const everythingWrong = machine({
        insideContainer: async () => true,
        isWsl1: async () => true,
        ...bubblewrapRefused,
        appArmorRestrictsUserNamespaces: async () => true,
        hasBubblewrap: async () => false,
        missingLinuxHelpers: async () => ["socat", "ripgrep"],
      });
      expect((await srt(everythingWrong).check()).reason).toBe("container");
    });

    it("tells WSL 1 to switch the distro to WSL 2, before it asks about bubblewrap", async () => {
      const wsl1 = machine({ isWsl1: async () => true, hasBubblewrap: async () => false });
      expect(await srt(wsl1).check()).toEqual({
        ok: false,
        reason: "not-supported",
        missing: ["WSL 1 can't run bubblewrap; switch the distro to WSL 2"],
      });
    });

    it("says only that bubblewrap is missing, also when AppArmor restricts user namespaces (Ubuntu 24.04)", async () => {
      // Ubuntu 24.04's profile for bubblewrap lets it through once it's installed.
      const ubuntu = machine({
        hasBubblewrap: async () => false,
        appArmorRestrictsUserNamespaces: async () => true,
        missingLinuxHelpers: async () => ["socat", "ripgrep"],
      });
      expect(await srt(ubuntu).check()).toEqual({
        ok: false,
        reason: "bubblewrap-missing",
        missing: ["bubblewrap is not installed"],
      });
    });

    it("blames AppArmor only when bubblewrap fails and the setting is on", async () => {
      const bubblewrapThrough = machine({ appArmorRestrictsUserNamespaces: async () => true });
      expect((await srt(bubblewrapThrough).check()).ok).toBe(true);
      const restricted = machine({
        ...bubblewrapRefused,
        appArmorRestrictsUserNamespaces: async () => true,
      });
      expect((await srt(restricted).check()).reason).toBe("user-namespaces-restricted");
    });

    it("gives bubblewrap's own words when it fails for another reason", async () => {
      expect(await srt(machine(bubblewrapRefused)).check()).toEqual({
        ok: false,
        reason: "other",
        missing: ["bubblewrap can't start: bwrap: setting up uid map: Permission denied"],
      });
    });

    it("names the helpers that are missing", async () => {
      const missing = async (helpers: ("socat" | "ripgrep")[]) =>
        (await srt(machine({ missingLinuxHelpers: async () => helpers })).check()).missing;
      expect(await missing(["socat"])).toEqual(["socat is not installed"]);
      expect(await missing(["ripgrep"])).toEqual(["ripgrep is not installed"]);
      expect(await missing(["socat", "ripgrep"])).toEqual(["socat and ripgrep are not installed"]);
    });

    it("asks for the helpers before it calls a bubblewrap failure `other`, which comes last", async () => {
      const both = machine({ ...bubblewrapRefused, missingLinuxHelpers: async () => ["ripgrep"] });
      expect((await srt(both).check()).reason).toBe("linux-tools-missing");
    });

    it("is not ready when srt can't start its smallest sandbox, though bubblewrap can (HAL-6518)", async () => {
      const failing: Runner = {
        run: async () => endedProgram(1, "Error: failed to start the socat bridge\n"),
      };
      expect(await srt(machine(), failing).check()).toEqual({
        ok: false,
        reason: "other",
        missing: ["srt can't start a sandbox: Error: failed to start the socat bridge"],
      });
    });

    it("starts the smallest sandbox once per process, not on every check", async () => {
      const started: string[] = [];
      const runner: Runner = {
        run: async (request) => {
          started.push(request.program);
          return endedProgram(0);
        },
      };
      await srt(machine(), runner).check();
      await srt(machine(), runner).check();
      expect(started).toEqual(["true"]);
    });

    it("starts no sandbox when an earlier reason applies, or off Linux", async () => {
      const started: string[] = [];
      const runner: Runner = {
        run: async (request) => {
          started.push(request.program);
          return endedProgram(0);
        },
      };
      await srt(machine({ hasBubblewrap: async () => false }), runner).check();
      await srt(machine({ platform: "darwin" }), runner).check();
      await srt(
        machine({ platform: "win32", hasWindowsSandbox: async () => true }),
        runner,
      ).check();
      expect(started).toEqual([]);
    });

    it("starts on macOS with Seatbelt", async () => {
      const check = await srt(machine({ platform: "darwin" })).check();
      expect(check.ok).toBe(true);
    });

    it("starts on Windows only when srt's Windows install is there", async () => {
      const windows = { platform: "win32" as const };
      expect(
        await srt(machine({ ...windows, hasWindowsSandbox: async () => true })).check(),
      ).toEqual({ ok: true, reason: null, missing: [] });
      const missing = await srt(machine(windows)).check();
      expect(missing).toMatchObject({ ok: false, reason: "setup-needed" });
      expect(missing.missing[0]).toContain("windows-install");
    });

    it("opens nothing on Windows without srt's install", async () => {
      const sandbox = srt(machine({ platform: "win32" }));
      const profile = {
        workingFolder: "/contract/work",
        tempFolder: "/contract/temp",
        settingsFolder: null,
        readOnlyPaths: [],
        deniedPaths: [],
        env: {},
        network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
        timeLimitMs: 1000,
      };
      await expect(sandbox.open(profile)).rejects.toThrow("windows-install");
    });

    it("on Windows lets the sandbox look at the parents of every path it grants before it opens", async () => {
      const base = await mkdtemp(join(tmpdir(), "halonic-srt-parents-"));
      try {
        const asked: (readonly string[])[] = [];
        const sandbox = srt(
          machine({
            platform: "win32",
            hasWindowsSandbox: async () => true,
            letSandboxReadParents: async (folders) => {
              asked.push(folders);
              throw new Error("icacls failed");
            },
          }),
        );
        const temp = join(base, "tmp", "run_1");
        const profile = {
          workingFolder: join(base, "work"),
          tempFolder: temp,
          settingsFolder: join(base, "settings"),
          readOnlyPaths: [join(base, "workspace.yaml")],
          deniedPaths: [],
          env: {},
          network: { bridge: null, allowedSites: [] },
          timeLimitMs: 1000,
        };
        await expect(sandbox.open(profile)).rejects.toThrow("icacls failed");
        expect(asked).toEqual([
          [join(base, "work"), temp, join(base, "settings"), join(base, "workspace.yaml")],
        ]);
        // The temp folder is made first, so its parents are there to be granted.
        expect((await stat(temp)).isDirectory()).toBe(true);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    });

    it("says files are shared and the fence is the operating system's", () => {
      expect(srt(machine()).capabilities()).toEqual({ files: "shared", strength: "os" });
    });
  });

  describe("cgroupNamesContainer", () => {
    it("sees a Docker or Kubernetes control group, and not a plain one", () => {
      expect(cgroupNamesContainer("0::/docker/abc123")).toBe(true);
      expect(cgroupNamesContainer("0::/kubepods/burstable/pod1")).toBe(true);
      expect(cgroupNamesContainer("0::/user.slice/user-1000.slice")).toBe(false);
    });
  });
});

verifies("sandbox-srt.setup", () => {
  describe("cleanUp", () => {
    it("removes the entries sessions added on Windows, and says why when it can't", async () => {
      // A profile folder set with HALONIC_HOME, outside LOCALAPPDATA.
      const chosenProfile = ["D:", "halonic-home"].join("\\");
      const forgotten: string[] = [];
      const windows = machine({
        platform: "win32",
        forgetSandboxParents: async (profileFolder) => {
          forgotten.push(profileFolder);
        },
      });
      expect(await new SrtSandbox(windows).cleanUp(chosenProfile)).toEqual({ ok: true });
      expect(forgotten).toEqual([chosenProfile]);
      windows.forgetSandboxParents = async () => {
        throw new Error("icacls failed\non a folder");
      };
      expect(await new SrtSandbox(windows).cleanUp(chosenProfile)).toEqual({
        ok: false,
        reason: "icacls failed on a folder",
      });
    });

    it("has nothing to remove on other systems", async () => {
      const forget = vi.fn(async () => undefined);
      expect(await new SrtSandbox(machine({ forgetSandboxParents: forget })).cleanUp("/p")).toEqual(
        {
          ok: true,
        },
      );
      expect(forget).not.toHaveBeenCalled();
    });
  });

  describe("SrtSandbox.setUp", () => {
    /** Windows, where each install brings the sandbox in. */
    function windowsMachine(install: Machine["installWindowsSandbox"]) {
      let installed = false;
      return machine({
        platform: "win32",
        hasWindowsSandbox: async () => installed,
        installWindowsSandbox: async () => {
          const result = await install();
          installed ||= result === "installed";
          return result;
        },
      });
    }

    it("installs on Windows and is done once the sandbox passes its check", async () => {
      const sandbox = srt(windowsMachine(async () => "installed"));
      expect(await sandbox.setUp()).toEqual({ ok: true });
      expect((await sandbox.check()).ok).toBe(true);
    });

    it("is done again when run again", async () => {
      const sandbox = srt(windowsMachine(async () => "installed"));
      await sandbox.setUp();
      expect(await sandbox.setUp()).toEqual({ ok: true });
    });

    it("says the administrator prompt was cancelled", async () => {
      const sandbox = srt(windowsMachine(async () => "cancelled"));
      expect(await sandbox.setUp()).toEqual({
        ok: false,
        reason: "the administrator prompt was cancelled; nothing changed",
      });
    });

    it("gives the install's own words on one line when it fails", async () => {
      const sandbox = srt(
        windowsMachine(async () => {
          throw new Error("srt-win install: WFP filter install failed:\r\n  access denied\r\n");
        }),
      );
      expect(await sandbox.setUp()).toEqual({
        ok: false,
        reason: "srt-win install: WFP filter install failed: access denied",
      });
    });

    it("gives the check's words when the sandbox still can't start after the install", async () => {
      const sandbox = srt(machine({ platform: "win32" }));
      const setup = await sandbox.setUp();
      expect(setup.ok).toBe(false);
      expect(setup.ok ? "" : setup.reason).toContain("windows-install");
    });

    it("installs nothing on other systems", async () => {
      let installs = 0;
      const linux = machine({
        installWindowsSandbox: async () => {
          installs++;
          return "installed";
        },
      });
      expect(await srt(linux).setUp()).toEqual({
        ok: false,
        reason: "only Windows has a sandbox setup, not linux",
      });
      expect(installs).toBe(0);
    });
  });
});

verifies("sandbox-srt.remove", () => {
  describe("SrtSandbox.remove", () => {
    /** Windows with the sandbox set up, where each uninstall answers as `uninstall` does. */
    function windowsMachine(uninstall: Machine["uninstallWindowsSandbox"]) {
      let installed = true;
      return machine({
        platform: "win32",
        hasWindowsSandbox: async () => installed,
        uninstallWindowsSandbox: async () => {
          const result = await uninstall();
          installed &&= result !== "removed";
          return result;
        },
      });
    }

    it("removes the Windows install, so the sandbox needs its setup again", async () => {
      const sandbox = new SrtSandbox(windowsMachine(async () => "removed"));
      expect(await sandbox.remove()).toEqual({ ok: true });
      expect(await sandbox.check()).toMatchObject({ ok: false, reason: "setup-needed" });
    });

    it("is done again when run again", async () => {
      const sandbox = new SrtSandbox(windowsMachine(async () => "removed"));
      await sandbox.remove();
      expect(await sandbox.remove()).toEqual({ ok: true });
    });

    it("says the administrator prompt was cancelled, and the sandbox stays", async () => {
      const sandbox = new SrtSandbox(windowsMachine(async () => "cancelled"));
      expect(await sandbox.remove()).toEqual({
        ok: false,
        reason: "the administrator prompt was cancelled; nothing changed",
      });
      expect((await sandbox.check()).ok).toBe(true);
    });

    it("gives the uninstall's own words on one line when it fails", async () => {
      const sandbox = new SrtSandbox(
        windowsMachine(async () => {
          throw new Error("srt-win uninstall failed (exit 22):\r\n  kept_grants_in_use\r\n");
        }),
      );
      expect(await sandbox.remove()).toEqual({
        ok: false,
        reason: "srt-win uninstall failed (exit 22): kept_grants_in_use",
      });
    });

    it("removes nothing on other systems, where there is nothing to remove", async () => {
      let uninstalls = 0;
      const linux = machine({
        uninstallWindowsSandbox: async () => {
          uninstalls++;
          return "removed";
        },
      });
      expect(await new SrtSandbox(linux).remove()).toEqual({ ok: true });
      expect(uninstalls).toBe(0);
    });
  });
});
