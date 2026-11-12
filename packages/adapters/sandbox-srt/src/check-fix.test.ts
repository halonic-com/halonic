import { readFile } from "node:fs/promises";
import { delimiter } from "node:path";
import { type SandboxPackageManager, sandboxPackageManagers } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type Machine, systemMachine } from "./machine.ts";
import { bubblewrapProfile, bubblewrapProfilePath, findPackageManager } from "./package-manager.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { linux } from "./srt-session.test-helper.ts";

/** The check on a Linux machine that can start the sandbox, with `overrides` spoiling it. */
function check(overrides: Partial<Machine>) {
  return new SrtSandbox({ ...linux, ...overrides }).check();
}

/** Whether a path is one of `programs`, for a fake file system. */
function programsAt(...programs: string[]) {
  return async (path: string) => programs.includes(path);
}

/** The AppArmor profile and its path, as the CI step that loads it writes them. */
async function ciProfile(): Promise<{ path: string; profile: string }> {
  const ci = await readFile(
    new URL("../../../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const lines = ci.split("\n");
  const tee = lines.findIndex((line) =>
    /sudo tee \/etc\/apparmor\.d\/\S+ > \/dev\/null << 'EOF'/.test(line),
  );
  expect(tee, "ci.yml writes the bwrap profile with sudo tee").toBeGreaterThan(-1);
  const path = /sudo tee (\S+)/.exec(lines[tee] ?? "")?.[1] ?? "";
  const end = lines.findIndex((line, index) => index > tee && line.trim() === "EOF");
  const body = lines.slice(tee + 1, end);
  const indent = /^\s*/.exec(body[0] ?? "")?.[0].length ?? 0;
  return { path, profile: `${body.map((line) => line.slice(indent)).join("\n")}\n` };
}

verifies("sandbox-srt.check-fix", () => {
  describe("the fix a refused check names", () => {
    it("installs bubblewrap and every missing helper in one go, with the package manager found", async () => {
      const fedora = await check({
        hasBubblewrap: async () => false,
        missingLinuxHelpers: async () => ["socat"],
        packageManager: async () => "dnf",
      });
      expect(fedora).toEqual({
        ok: false,
        reason: "bubblewrap-missing",
        missing: ["bubblewrap is not installed"],
        fix: { kind: "install", packageManager: "dnf", packages: ["bubblewrap", "socat"] },
      });
    });

    it.each<[SandboxPackageManager | null]>([["apt"], ["dnf"], ["pacman"], ["zypper"], [null]])(
      "installs the missing helpers with %s",
      async (packageManager) => {
        const result = await check({
          missingLinuxHelpers: async () => ["ripgrep"],
          packageManager: async () => packageManager,
        });
        expect(result.ok ? undefined : [result.reason, result.fix]).toEqual([
          "linux-tools-missing",
          { kind: "install", packageManager, packages: ["ripgrep"] },
        ]);
      },
    );

    it("installs ripgrep with Homebrew on macOS", async () => {
      const mac = await check({
        platform: "darwin",
        hasRipgrep: async () => false,
        packageManager: async () => "brew",
      });
      expect(mac.ok ? undefined : mac.fix).toEqual({
        kind: "install",
        packageManager: "brew",
        packages: ["ripgrep"],
      });
    });

    it("names the AppArmor profile for bwrap alone, never the machine-wide setting", async () => {
      const ubuntu = await check({
        bubblewrapUserNamespaceError: async () => "setting up uid map: Permission denied",
        appArmorRestrictsUserNamespaces: async () => true,
      });
      expect(ubuntu.ok ? undefined : ubuntu.fix).toEqual({
        kind: "apparmor-profile",
        program: "/usr/bin/bwrap",
        path: "/etc/apparmor.d/bwrap",
        profile: bubblewrapProfile,
      });
      expect(JSON.stringify(ubuntu)).not.toContain("sysctl");
      expect(JSON.stringify(ubuntu)).not.toContain("apparmor_restrict_unprivileged_userns");
    });

    it("uses the same profile and path that CI loads on Ubuntu 24.04", async () => {
      expect(await ciProfile()).toEqual({
        path: bubblewrapProfilePath,
        profile: bubblewrapProfile,
      });
    });

    it("names no fix for a reason it has none for", async () => {
      const container = await check({ insideContainer: async () => true });
      expect(container).toEqual({
        ok: false,
        reason: "container",
        missing: ["Halonic runs inside a container"],
      });
    });
  });

  describe("findPackageManager", () => {
    const path = ["/usr/local/bin", "/usr/bin"].join(delimiter);

    it.each<[string, SandboxPackageManager]>([
      ["/usr/bin/apt-get", "apt"],
      ["/usr/bin/dnf", "dnf"],
      ["/usr/bin/pacman", "pacman"],
      ["/usr/bin/zypper", "zypper"],
    ])("finds %s on PATH as %s", async (program, manager) => {
      expect(await findPackageManager("linux", path, programsAt(program))).toBe(manager);
    });

    it("takes the first in its order when a machine has more than one", async () => {
      const both = programsAt("/usr/bin/pacman", "/usr/local/bin/apt-get");
      expect(await findPackageManager("linux", path, both)).toBe("apt");
    });

    it("says null when no package manager it knows is on PATH", async () => {
      expect(await findPackageManager("linux", path, programsAt("/usr/bin/yum"))).toBeNull();
      expect(await findPackageManager("linux", "", programsAt("/usr/bin/apt-get"))).toBeNull();
    });

    it("finds Homebrew on macOS also where it installs, outside PATH", async () => {
      const brew = programsAt("/opt/homebrew/bin/brew");
      expect(await findPackageManager("darwin", "/usr/bin", brew)).toBe("brew");
      expect(await findPackageManager("darwin", "/usr/bin", programsAt())).toBeNull();
    });

    it("answers on this machine with a listed package manager or null", async () => {
      expect([...sandboxPackageManagers, null]).toContain(await systemMachine.packageManager());
    });

    it("looks for no Linux package manager on macOS, and for none on Windows", async () => {
      const apt = programsAt("/usr/bin/apt-get", "/usr/bin/brew");
      expect(await findPackageManager("darwin", path, programsAt("/usr/bin/apt-get"))).toBeNull();
      expect(await findPackageManager("win32", path, apt)).toBeNull();
    });
  });
});
