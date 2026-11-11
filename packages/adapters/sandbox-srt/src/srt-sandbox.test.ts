import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxCheckContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { cgroupNamesContainer, type Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";

/** A Linux machine that can start the sandbox; each test spoils one thing. */
function machine(overrides: Partial<Machine> = {}): Machine {
  return {
    platform: "linux",
    insideContainer: async () => false,
    hasBubblewrap: async () => true,
    hasLinuxHelpers: async () => true,
    userNamespacesRestricted: async () => false,
    hasSeatbelt: async () => true,
    hasWindowsSandbox: async () => false,
    installWindowsSandbox: async () => "installed" as const,
    letSandboxReadParents: async () => undefined,
    ...overrides,
  };
}

sandboxCheckContract("srt", {
  make: async () => new SrtSandbox(machine()),
  makeUnavailable: async () => new SrtSandbox(machine({ hasBubblewrap: async () => false })),
});

verifies("sandbox-srt.check", () => {
  describe("SrtSandbox.check", () => {
    it("can start on a Linux machine with bubblewrap and user namespaces", async () => {
      expect(await new SrtSandbox(machine()).check()).toEqual({
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
      const check = await new SrtSandbox(broken).check();
      expect(check.ok).toBe(false);
      expect(check.reason).toBe("other");
      expect(check.missing).toHaveLength(1);
    });

    it.each([
      ["setup-needed", { platform: "win32" as const }],
      ["container", { insideContainer: async () => true }],
      ["user-namespaces-restricted", { userNamespacesRestricted: async () => true }],
      ["bubblewrap-missing", { hasBubblewrap: async () => false }],
      ["linux-tools-missing", { hasLinuxHelpers: async () => false }],
      ["other", { platform: "darwin" as const, hasSeatbelt: async () => false }],
    ])("gives the reason %s", async (reason, overrides) => {
      const check = await new SrtSandbox(machine(overrides)).check();
      expect(check.reason).toBe(reason);
      expect(check.missing).toHaveLength(1);
    });

    it("gives the first reason in the port's order when several apply", async () => {
      const everythingWrong = machine({
        insideContainer: async () => true,
        userNamespacesRestricted: async () => true,
        hasBubblewrap: async () => false,
        hasLinuxHelpers: async () => false,
      });
      expect((await new SrtSandbox(everythingWrong).check()).reason).toBe("container");
    });

    it("starts on macOS with Seatbelt", async () => {
      const check = await new SrtSandbox(machine({ platform: "darwin" })).check();
      expect(check.ok).toBe(true);
    });

    it("starts on Windows only when srt's Windows install is there", async () => {
      const windows = { platform: "win32" as const };
      expect(
        await new SrtSandbox(machine({ ...windows, hasWindowsSandbox: async () => true })).check(),
      ).toEqual({ ok: true, reason: null, missing: [] });
      const missing = await new SrtSandbox(machine(windows)).check();
      expect(missing).toMatchObject({ ok: false, reason: "setup-needed" });
      expect(missing.missing[0]).toContain("windows-install");
    });

    it("opens nothing on Windows without srt's install", async () => {
      const sandbox = new SrtSandbox(machine({ platform: "win32" }));
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
        const sandbox = new SrtSandbox(
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
      expect(new SrtSandbox(machine()).capabilities()).toEqual({ files: "shared", strength: "os" });
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
      const sandbox = new SrtSandbox(windowsMachine(async () => "installed"));
      expect(await sandbox.setUp()).toEqual({ ok: true });
      expect((await sandbox.check()).ok).toBe(true);
    });

    it("is done again when run again", async () => {
      const sandbox = new SrtSandbox(windowsMachine(async () => "installed"));
      await sandbox.setUp();
      expect(await sandbox.setUp()).toEqual({ ok: true });
    });

    it("says the administrator prompt was cancelled", async () => {
      const sandbox = new SrtSandbox(windowsMachine(async () => "cancelled"));
      expect(await sandbox.setUp()).toEqual({
        ok: false,
        reason: "the administrator prompt was cancelled; nothing changed",
      });
    });

    it("gives the install's own words on one line when it fails", async () => {
      const sandbox = new SrtSandbox(
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
      const sandbox = new SrtSandbox(machine({ platform: "win32" }));
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
      expect(await new SrtSandbox(linux).setUp()).toEqual({
        ok: false,
        reason: "only Windows has a sandbox setup, not linux",
      });
      expect(installs).toBe(0);
    });
  });
});
