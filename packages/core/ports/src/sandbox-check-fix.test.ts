import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type SandboxCheck, type SandboxFix, sandboxPackageManagers } from "./index.ts";

verifies("ports.sandbox-check-fix", () => {
  it("lists the package managers a fix can name", () => {
    expect(sandboxPackageManagers).toEqual(["apt", "dnf", "pacman", "zypper", "brew"]);
  });

  it("names one install of every missing package with the package manager found", () => {
    const check: SandboxCheck = {
      ok: false,
      reason: "bubblewrap-missing",
      missing: ["bubblewrap is not installed", "socat is not installed"],
      fix: { kind: "install", packageManager: "dnf", packages: ["bubblewrap", "socat"] },
    };
    expect(check.ok ? undefined : check.fix).toEqual({
      kind: "install",
      packageManager: "dnf",
      packages: ["bubblewrap", "socat"],
    });
  });

  it("still names the packages when no known package manager is found", () => {
    const fix: SandboxFix = { kind: "install", packageManager: null, packages: ["ripgrep"] };
    expect(fix.packageManager).toBeNull();
  });

  it("names an AppArmor profile for one program, not the machine-wide setting", () => {
    const check: SandboxCheck = {
      ok: false,
      reason: "user-namespaces-restricted",
      missing: ["unprivileged user namespaces are restricted"],
      fix: {
        kind: "apparmor-profile",
        program: "/usr/bin/bwrap",
        path: "/etc/apparmor.d/bwrap",
        profile: "abi <abi/4.0>,\n",
      },
    };
    expect(check.ok ? undefined : check.fix?.kind).toBe("apparmor-profile");
  });

  it("keeps the fix optional, so an adapter that knows none compiles unchanged", () => {
    const withoutFix: SandboxCheck = {
      ok: false,
      reason: "container",
      missing: ["runs in Docker"],
    };
    expect("fix" in withoutFix).toBe(false);
  });

  it("doesn't compile with a fix on a check that works, or an unlisted package manager", () => {
    const works: SandboxCheck = {
      ok: true,
      reason: null,
      missing: [],
      // @ts-expect-error: a sandbox that can start needs no fix
      fix: { kind: "install", packageManager: "apt", packages: [] },
    };
    const unlisted: SandboxFix = {
      kind: "install",
      // @ts-expect-error: package managers come from the closed list
      packageManager: "yum",
      packages: ["bubblewrap"],
    };
    // @ts-expect-error: a fix is data, never a command line
    const command: SandboxFix = { kind: "command", text: "sudo sysctl -w kernel.x=0" };
    expect([works, unlisted, command]).toHaveLength(3);
  });
});
